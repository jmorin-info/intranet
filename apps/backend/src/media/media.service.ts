import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  MediaAlbum,
  MediaItem,
  MediaType,
  MediaVisibility,
  Prisma,
} from "@prisma/client";
import * as path from "path";
import * as fs from "fs/promises";
import { spawn } from "child_process";
import sharp from "sharp";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/interfaces";
import { ROLE_HIERARCHY, UserRole } from "../common/enums";
import { generateUniqueSlug } from "../common/utils/slugify";
import { CreateAlbumDto, UpdateAlbumDto, UpdateItemDto } from "./dto/media.dto";

const MEDIA_ROOT = path.join(process.cwd(), "storage", "media");
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 Go
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);
const THUMB_SIZE = 600; // côté max

/**
 * Service Médiathèque.
 * - Albums + items + analytics download
 * - Thumbnails sharp pour images. Vidéos : thumbnail générique (ffmpeg absent
 *   en prod pour MVP, à installer Phase 2 pour extraire un poster).
 * - Storage local /storage/media/albums/{albumId}/{originals,thumbs}/
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ========================================================================
  // Permissions
  // ========================================================================

  private isAdmin(user: RequestUser): boolean {
    return (
      ROLE_HIERARCHY[user.role as UserRole] >= ROLE_HIERARCHY[UserRole.ADMIN]
    );
  }

  private async canManage(userId: string, role: string): Promise<boolean> {
    if (ROLE_HIERARCHY[role as UserRole] >= ROLE_HIERARCHY[UserRole.ADMIN])
      return true;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { canManageMedia: true },
    });
    return !!user?.canManageMedia;
  }

  private async assertCanManage(user: RequestUser): Promise<void> {
    if (!(await this.canManage(user.id, user.role))) {
      throw new ForbiddenException(
        "Action réservée à l'équipe Marketing (canManageMedia) et aux administrateurs.",
      );
    }
  }

  /** Retourne les ids d'albums visibles pour l'utilisateur. */
  private async albumVisibilityFilter(
    user: RequestUser,
  ): Promise<Prisma.MediaAlbumWhereInput> {
    if (this.isAdmin(user)) return {};

    const or: Prisma.MediaAlbumWhereInput[] = [
      { visibility: "INTERNAL" },
      { createdById: user.id }, // son propre album même PRIVATE
    ];
    if (user.departmentId) {
      or.push({ visibility: "DEPARTMENT", departmentId: user.departmentId });
    }
    return { OR: or };
  }

  // ========================================================================
  // Albums — CRUD
  // ========================================================================

  async listAlbums(user: RequestUser) {
    const where = await this.albumVisibilityFilter(user);
    const albums = await this.prisma.mediaAlbum.findMany({
      where,
      include: {
        coverItem: {
          select: {
            id: true,
            thumbnailUrl: true,
            type: true,
            fileUrl: true,
            width: true,
            height: true,
          },
        },
        items: {
          select: {
            id: true,
            type: true,
            thumbnailUrl: true,
            fileUrl: true,
            width: true,
            height: true,
          },
          orderBy: { createdAt: "desc" },
          take: 4,
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    // Renomme items → previewItems pour clarifier l'intention côté API
    return albums.map(({ items, ...album }) => ({
      ...album,
      previewItems: items,
    }));
  }

  async getAlbumBySlug(slug: string, user: RequestUser) {
    const album = await this.prisma.mediaAlbum.findUnique({
      where: { slug },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        department: { select: { id: true, name: true } },
        coverItem: {
          include: {
            uploadedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        items: {
          orderBy: { createdAt: "desc" },
          include: {
            uploadedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            _count: { select: { downloads: true } },
          },
        },
        _count: { select: { items: true } },
      },
    });
    if (!album) throw new NotFoundException("Album introuvable.");
    if (!(await this.userCanViewAlbum(album, user))) {
      throw new NotFoundException("Album introuvable.");
    }
    // BigInt (fileSizeBytes) doit être sérialisé en string côté JSON
    return {
      ...album,
      coverItem: album.coverItem
        ? {
            ...album.coverItem,
            fileSizeBytes: album.coverItem.fileSizeBytes.toString(),
          }
        : null,
      items: album.items.map((it) => ({
        ...it,
        fileSizeBytes: it.fileSizeBytes.toString(),
      })),
    };
  }

  private async userCanViewAlbum(
    album: MediaAlbum,
    user: RequestUser,
  ): Promise<boolean> {
    if (this.isAdmin(user)) return true;
    if (album.createdById === user.id) return true;
    if (album.visibility === "INTERNAL") return true;
    if (
      album.visibility === "DEPARTMENT" &&
      album.departmentId === user.departmentId
    )
      return true;
    return false;
  }

  async createAlbum(
    user: RequestUser,
    dto: CreateAlbumDto,
  ): Promise<MediaAlbum> {
    await this.assertCanManage(user);

    const slug = await generateUniqueSlug(dto.title.trim(), async (s) => {
      const existing = await this.prisma.mediaAlbum.findUnique({
        where: { slug: s },
      });
      return !!existing;
    });

    const album = await this.prisma.mediaAlbum.create({
      data: {
        title: dto.title.trim(),
        slug,
        description: dto.description?.trim() || null,
        visibility: (dto.visibility as MediaVisibility) ?? "INTERNAL",
        departmentId:
          dto.visibility === "DEPARTMENT" ? (dto.departmentId ?? null) : null,
        createdById: user.id,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: "MEDIA_ALBUM_CREATED",
      resourceType: "MediaAlbum",
      resourceId: album.id,
      metadata: {
        title: album.title,
        visibility: album.visibility,
      } as unknown as Record<string, unknown>,
      severity: "INFO",
    });

    return album;
  }

  async updateAlbum(
    user: RequestUser,
    id: string,
    dto: UpdateAlbumDto,
  ): Promise<MediaAlbum> {
    await this.assertCanManage(user);
    const album = await this.prisma.mediaAlbum.findUnique({ where: { id } });
    if (!album) throw new NotFoundException("Album introuvable.");

    // Seul le créateur ou un admin peut éditer
    if (album.createdById !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException(
        "Seul le créateur ou un administrateur peut modifier cet album.",
      );
    }

    const updated = await this.prisma.mediaAlbum.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.visibility !== undefined
          ? { visibility: dto.visibility as MediaVisibility }
          : {}),
        ...(dto.departmentId !== undefined
          ? { departmentId: dto.departmentId ?? null }
          : {}),
        ...(dto.coverItemId !== undefined
          ? { coverItemId: dto.coverItemId ?? null }
          : {}),
      },
    });

    await this.audit.log({
      userId: user.id,
      action: "MEDIA_ALBUM_UPDATED",
      resourceType: "MediaAlbum",
      resourceId: id,
      severity: "INFO",
    });

    return updated;
  }

  // ========================================================================
  // Album cover image — upload dédié (distinct du coverItem qui pointe sur un
  // MediaItem existant). Stocké sous storage/media/albums/{id}/cover/.
  // L'URL produite pointe vers GET /api/v1/media/albums/:id/cover-image,
  // servie avec auth (les images d'album restent privées par visibilité).
  // ========================================================================

  async setAlbumCoverImage(
    user: RequestUser,
    albumId: string,
    file: Express.Multer.File,
  ): Promise<{ coverImageUrl: string }> {
    await this.assertCanManage(user);
    const album = await this.prisma.mediaAlbum.findUnique({
      where: { id: albumId },
    });
    if (!album) throw new NotFoundException("Album introuvable.");
    if (album.createdById !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException(
        "Seul le créateur ou un administrateur peut modifier cet album.",
      );
    }

    if (!file || !file.buffer) {
      throw new BadRequestException(
        'Aucun fichier reçu (le champ "file" est vide ou le multipart est malformé).',
      );
    }
    const mime = file.mimetype.toLowerCase();
    if (!IMAGE_MIMES.has(mime)) {
      throw new BadRequestException(
        `Type de fichier non autorisé pour une image de couverture : ${mime}.`,
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException("Fichier trop volumineux.");
    }

    const coverDir = path.join(MEDIA_ROOT, "albums", albumId, "cover");
    await fs.mkdir(coverDir, { recursive: true });

    // Nettoie une éventuelle cover précédente avant d'écrire la nouvelle, afin
    // d'éviter d'accumuler des fichiers orphelins sur disque.
    try {
      const existing = await fs.readdir(coverDir);
      await Promise.all(
        existing.map((f) =>
          fs.rm(path.join(coverDir, f), { force: true }).catch(() => {
            /* ignore */
          }),
        ),
      );
    } catch {
      /* ignore : dossier inexistant */
    }

    const filename = `cover.webp`;
    const destPath = path.join(coverDir, filename);
    try {
      await sharp(file.buffer)
        .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86 })
        .toFile(destPath);
    } catch (err) {
      this.logger.warn(`Cover image resize échoué pour album ${albumId} : ${err}`);
      // Fallback : écrire le buffer brut au format d'origine
      await fs.writeFile(destPath, file.buffer);
    }

    // URL servie via endpoint dédié auth (cohérent avec serveThumb/serveFile)
    const coverImageUrl = `/api/v1/media/albums/${albumId}/cover-image`;
    await this.prisma.mediaAlbum.update({
      where: { id: albumId },
      data: { coverImageUrl },
    });

    await this.audit.log({
      userId: user.id,
      action: "MEDIA_ALBUM_COVER_IMAGE_SET",
      resourceType: "MediaAlbum",
      resourceId: albumId,
      severity: "INFO",
    });

    return { coverImageUrl };
  }

  async removeAlbumCoverImage(
    user: RequestUser,
    albumId: string,
  ): Promise<{ message: string }> {
    await this.assertCanManage(user);
    const album = await this.prisma.mediaAlbum.findUnique({
      where: { id: albumId },
    });
    if (!album) throw new NotFoundException("Album introuvable.");
    if (album.createdById !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException(
        "Seul le créateur ou un administrateur peut modifier cet album.",
      );
    }

    const coverDir = path.join(MEDIA_ROOT, "albums", albumId, "cover");
    try {
      await fs.rm(coverDir, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(
        `Suppression cover image album ${albumId} échouée : ${err}`,
      );
    }

    await this.prisma.mediaAlbum.update({
      where: { id: albumId },
      data: { coverImageUrl: null },
    });

    await this.audit.log({
      userId: user.id,
      action: "MEDIA_ALBUM_COVER_IMAGE_REMOVED",
      resourceType: "MediaAlbum",
      resourceId: albumId,
      severity: "INFO",
    });

    return { message: "Image de couverture retirée." };
  }

  /** Retourne le path disque + mime de la cover image d'un album. */
  async getAlbumCoverImagePath(
    albumId: string,
    user: RequestUser,
  ): Promise<{ path: string; mime: string }> {
    const album = await this.prisma.mediaAlbum.findUnique({
      where: { id: albumId },
    });
    if (!album) throw new NotFoundException("Album introuvable.");
    if (!(await this.userCanViewAlbum(album, user))) {
      throw new NotFoundException("Album introuvable.");
    }
    if (!album.coverImageUrl) {
      throw new NotFoundException("Aucune image de couverture définie.");
    }
    const coverDir = path.join(MEDIA_ROOT, "albums", albumId, "cover");
    const filePath = path.join(coverDir, "cover.webp");
    return { path: filePath, mime: "image/webp" };
  }

  async deleteAlbum(
    user: RequestUser,
    id: string,
  ): Promise<{ message: string }> {
    await this.assertCanManage(user);
    const album = await this.prisma.mediaAlbum.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!album) throw new NotFoundException("Album introuvable.");
    if (album.createdById !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException(
        "Seul le créateur ou un administrateur peut supprimer cet album.",
      );
    }

    // Supprime d'abord les fichiers sur disque
    const albumDir = path.join(MEDIA_ROOT, "albums", album.id);
    try {
      await fs.rm(albumDir, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(`Suppression fichiers album ${id} échouée : ${err}`);
    }

    // Cascade delete des items + downloads via Prisma
    await this.prisma.mediaAlbum.delete({ where: { id } });

    await this.audit.log({
      userId: user.id,
      action: "MEDIA_ALBUM_DELETED",
      resourceType: "MediaAlbum",
      resourceId: id,
      metadata: {
        title: album.title,
        itemsCount: album.items.length,
      } as unknown as Record<string, unknown>,
      severity: "WARN",
    });

    return {
      message: `Album "${album.title}" supprimé (${album.items.length} média(s)).`,
    };
  }

  // ========================================================================
  // Items — upload + CRUD
  // ========================================================================

  async uploadItem(
    user: RequestUser,
    albumId: string,
    file: Express.Multer.File,
  ): Promise<Omit<MediaItem, "fileSizeBytes"> & { fileSizeBytes: string }> {
    this.logger.log(
      `Media upload attempt: user=${user.id} role=${user.role} album=${albumId} ` +
        `file=${file?.originalname} mime=${file?.mimetype} size=${file?.size}`,
    );
    await this.assertCanManage(user);

    const album = await this.prisma.mediaAlbum.findUnique({
      where: { id: albumId },
    });
    if (!album) throw new NotFoundException("Album introuvable.");

    if (!file || !file.buffer) {
      throw new BadRequestException(
        'Aucun fichier reçu (le champ "file" est vide ou le multipart est malformé).',
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Fichier trop volumineux (max ${MAX_FILE_SIZE_BYTES / (1024 * 1024 * 1024)} Go).`,
      );
    }

    const mime = file.mimetype.toLowerCase();
    let type: MediaType;
    if (IMAGE_MIMES.has(mime)) type = "IMAGE";
    else if (VIDEO_MIMES.has(mime)) type = "VIDEO";
    else
      throw new BadRequestException(
        `Type de fichier non autorisé : ${mime}. Images acceptées: JPEG/PNG/WebP/GIF/AVIF. Vidéos: MP4/WebM/MOV/MKV.`,
      );

    // Préparation dossier
    const albumDir = path.join(MEDIA_ROOT, "albums", albumId);
    const originalsDir = path.join(albumDir, "originals");
    const thumbsDir = path.join(albumDir, "thumbs");
    await fs.mkdir(originalsDir, { recursive: true });
    await fs.mkdir(thumbsDir, { recursive: true });

    // Nom unique basé timestamp + extension
    const extMatch = file.originalname.match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : "bin";
    const id = crypto.randomUUID();
    const originalFilename = `${id}.${ext}`;
    const originalPath = path.join(originalsDir, originalFilename);
    await fs.writeFile(originalPath, file.buffer);

    // Thumbnail
    let width: number | undefined;
    let height: number | undefined;
    const thumbFilename = `${id}.webp`;
    const thumbPath = path.join(thumbsDir, thumbFilename);

    if (type === "IMAGE") {
      try {
        const meta = await sharp(file.buffer).metadata();
        width = meta.width;
        height = meta.height;
        await sharp(file.buffer)
          .resize(THUMB_SIZE, THUMB_SIZE, {
            fit: "cover",
            position: "attention",
          })
          .webp({ quality: 82 })
          .toFile(thumbPath);
      } catch (err) {
        this.logger.warn(
          `Thumbnail génération échouée pour ${file.originalname} : ${err}`,
        );
      }
    } else {
      // Vidéo : extraction d'un poster via ffmpeg si disponible, sinon
      // fallback sur un placeholder SVG générique.
      const posterOk = await this.extractVideoPoster(originalPath, thumbPath);
      if (!posterOk) {
        await this.ensureVideoPlaceholderThumb(thumbPath);
      }
      // Récupération de la durée pour stocker en DB (durationSec)
      const duration = await this.probeVideoDuration(originalPath);
      if (duration) {
        // On met à jour un peu plus bas après le create
        (
          file as Express.Multer.File & { __durationSec?: number }
        ).__durationSec = duration;
      }
    }

    // URLs servies par le backend (route media/items/:id/file et /thumb)
    const fileUrl = `/api/v1/media/items/%ID%/file`;
    const thumbnailUrl = `/api/v1/media/items/%ID%/thumb`;

    const item = await this.prisma.mediaItem.create({
      data: {
        albumId,
        type,
        fileUrl, // remplacé ci-dessous par %ID% → vrai id
        thumbnailUrl,
        width: width ?? null,
        height: height ?? null,
        durationSec:
          (file as Express.Multer.File & { __durationSec?: number })
            .__durationSec ?? null,
        fileSizeBytes: BigInt(file.size),
        mimeType: mime,
        title: null,
        description: null,
        tags: [],
        uploadedById: user.id,
      },
    });

    // Remplace les placeholders %ID% par le vrai id
    await this.prisma.mediaItem.update({
      where: { id: item.id },
      data: {
        fileUrl: fileUrl.replace("%ID%", item.id),
        thumbnailUrl: thumbnailUrl.replace("%ID%", item.id),
      },
    });

    // Stocker le lien disque réel via un fichier meta (pour retrouver les paths)
    const metaPath = path.join(albumDir, `${item.id}.meta.json`);
    await fs.writeFile(
      metaPath,
      JSON.stringify(
        { id: item.id, originalFilename, thumbFilename, type, mime },
        null,
        2,
      ),
    );

    await this.audit.log({
      userId: user.id,
      action: "MEDIA_ITEM_UPLOADED",
      resourceType: "MediaItem",
      resourceId: item.id,
      metadata: {
        albumId,
        type,
        mime,
        size: file.size,
        originalName: file.originalname,
      } as unknown as Record<string, unknown>,
      severity: "INFO",
    });

    // BigInt n'est pas sérialisable en JSON → conversion en string pour que
    // Express ne renvoie pas 500 après un upload réussi (symptôme observé :
    // fichier bien uploadé sur disque/DB mais toast d'erreur côté UI).
    return {
      ...item,
      fileUrl: fileUrl.replace("%ID%", item.id),
      thumbnailUrl: thumbnailUrl.replace("%ID%", item.id),
      fileSizeBytes: item.fileSizeBytes.toString(),
    };
  }

  private async ensureVideoPlaceholderThumb(destPath: string): Promise<void> {
    // Crée un placeholder WebP noir 600x600 avec triangle play-icon blanc.
    // Utilisé en fallback si ffmpeg indisponible ou échoue sur le poster.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <rect width="600" height="600" fill="#1a202c"/>
      <polygon points="240,190 420,300 240,410" fill="#ffffff" opacity="0.9"/>
    </svg>`;
    await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(destPath);
  }

  /**
   * Extrait une frame de la vidéo à t=1s comme poster et la convertit en
   * WebP 600px (crop cover). Nécessite ffmpeg dans $PATH. Retourne true
   * si le poster a été généré avec succès, false sinon (caller fera un
   * fallback sur le placeholder SVG).
   */
  private async extractVideoPoster(
    videoPath: string,
    destWebpPath: string,
  ): Promise<boolean> {
    const tmpJpg = `${destWebpPath}.frame.jpg`;
    const ok = await new Promise<boolean>((resolve) => {
      const ff = spawn(
        "ffmpeg",
        [
          "-y",
          "-ss",
          "00:00:01",
          "-i",
          videoPath,
          "-vframes",
          "1",
          "-q:v",
          "2",
          tmpJpg,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      ff.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      ff.on("error", () => resolve(false));
      ff.on("close", (code) => {
        if (code !== 0) {
          this.logger.warn(
            `ffmpeg poster extract exit=${code} stderr=${stderr.slice(-300)}`,
          );
          resolve(false);
        } else {
          resolve(true);
        }
      });
      setTimeout(() => {
        ff.kill("SIGKILL");
        resolve(false);
      }, 30_000); // 30s timeout
    });

    if (!ok) return false;

    try {
      await sharp(tmpJpg)
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "attention" })
        .webp({ quality: 82 })
        .toFile(destWebpPath);
      return true;
    } catch (err) {
      this.logger.warn(`sharp resize poster échoué : ${err}`);
      return false;
    } finally {
      await fs.rm(tmpJpg, { force: true }).catch(() => {
        /* ignore */
      });
    }
  }

  /** Probe la durée d'une vidéo (secondes, arrondi entier) via ffprobe. */
  private async probeVideoDuration(videoPath: string): Promise<number | null> {
    return new Promise<number | null>((resolve) => {
      const ff = spawn(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          videoPath,
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      let stdout = "";
      ff.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      ff.on("error", () => resolve(null));
      ff.on("close", (code) => {
        if (code !== 0) return resolve(null);
        const parsed = parseFloat(stdout.trim());
        resolve(Number.isFinite(parsed) ? Math.round(parsed) : null);
      });
      setTimeout(() => {
        ff.kill("SIGKILL");
        resolve(null);
      }, 10_000);
    });
  }

  async getItemFilePath(
    itemId: string,
    user: RequestUser,
    kind: "file" | "thumb",
  ): Promise<{ path: string; mime: string }> {
    const item = await this.prisma.mediaItem.findUnique({
      where: { id: itemId },
      include: { album: true },
    });
    if (!item) throw new NotFoundException("Média introuvable.");
    if (!(await this.userCanViewAlbum(item.album, user))) {
      throw new NotFoundException("Média introuvable.");
    }

    const albumDir = path.join(MEDIA_ROOT, "albums", item.albumId);
    const metaPath = path.join(albumDir, `${itemId}.meta.json`);
    const metaRaw = await fs.readFile(metaPath, "utf8").catch(() => null);
    if (!metaRaw)
      throw new NotFoundException("Fichier introuvable sur le disque.");
    const meta = JSON.parse(metaRaw) as {
      originalFilename: string;
      thumbFilename: string;
      mime: string;
    };

    if (kind === "thumb") {
      return {
        path: path.join(albumDir, "thumbs", meta.thumbFilename),
        mime: "image/webp",
      };
    }
    return {
      path: path.join(albumDir, "originals", meta.originalFilename),
      mime: meta.mime,
    };
  }

  async downloadItem(
    user: RequestUser,
    itemId: string,
  ): Promise<{ path: string; filename: string; mime: string }> {
    const item = await this.prisma.mediaItem.findUnique({
      where: { id: itemId },
      include: { album: true },
    });
    if (!item) throw new NotFoundException("Média introuvable.");
    if (!(await this.userCanViewAlbum(item.album, user))) {
      throw new NotFoundException("Média introuvable.");
    }

    const { path: filePath, mime } = await this.getItemFilePath(
      itemId,
      user,
      "file",
    );
    const filename = item.title
      ? `${item.title.replace(/[^a-z0-9-_\.]/gi, "_")}.${mime.split("/")[1] ?? "bin"}`
      : path.basename(filePath);

    // Log téléchargement (analytics Marketing)
    try {
      await this.prisma.mediaItemDownload.create({
        data: { itemId, userId: user.id },
      });
    } catch (err) {
      this.logger.warn(`Log download échoué pour item ${itemId} : ${err}`);
    }

    return { path: filePath, filename, mime };
  }

  async updateItem(
    user: RequestUser,
    id: string,
    dto: UpdateItemDto,
  ): Promise<MediaItem> {
    await this.assertCanManage(user);
    const item = await this.prisma.mediaItem.findUnique({
      where: { id },
      include: { album: true },
    });
    if (!item) throw new NotFoundException("Média introuvable.");
    if (
      item.uploadedById !== user.id &&
      item.album.createdById !== user.id &&
      !this.isAdmin(user)
    ) {
      throw new ForbiddenException(
        "Seul l'uploader, le créateur de l'album ou un administrateur peut modifier ce média.",
      );
    }

    return this.prisma.mediaItem.update({
      where: { id },
      data: {
        ...(dto.title !== undefined
          ? { title: dto.title?.trim() || null }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.tags !== undefined
          ? { tags: dto.tags.map((t) => t.trim()).filter(Boolean) }
          : {}),
      },
    });
  }

  async deleteItem(
    user: RequestUser,
    id: string,
  ): Promise<{ message: string }> {
    await this.assertCanManage(user);
    const item = await this.prisma.mediaItem.findUnique({
      where: { id },
      include: { album: true },
    });
    if (!item) throw new NotFoundException("Média introuvable.");
    if (
      item.uploadedById !== user.id &&
      item.album.createdById !== user.id &&
      !this.isAdmin(user)
    ) {
      throw new ForbiddenException(
        "Suppression réservée à l'uploader, au créateur de l'album ou à un administrateur.",
      );
    }

    const albumDir = path.join(MEDIA_ROOT, "albums", item.albumId);
    try {
      const meta = JSON.parse(
        await fs.readFile(path.join(albumDir, `${id}.meta.json`), "utf8"),
      );
      await fs.rm(path.join(albumDir, "originals", meta.originalFilename), {
        force: true,
      });
      await fs.rm(path.join(albumDir, "thumbs", meta.thumbFilename), {
        force: true,
      });
      await fs.rm(path.join(albumDir, `${id}.meta.json`), { force: true });
    } catch (err) {
      this.logger.warn(`Suppression fichiers media ${id} échouée : ${err}`);
    }

    await this.prisma.mediaItem.delete({ where: { id } });

    await this.audit.log({
      userId: user.id,
      action: "MEDIA_ITEM_DELETED",
      resourceType: "MediaItem",
      resourceId: id,
      severity: "WARN",
    });

    return { message: "Média supprimé." };
  }

  // ========================================================================
  // Stats (analytics Marketing)
  // ========================================================================

  /**
   * Liste flat de tous les items visibles par l'utilisateur, trié par date desc.
   * Alimente la vue "galerie" /media (onglets Toutes photos / Toutes vidéos).
   */
  async listAllItems(
    user: RequestUser,
    opts: { type?: MediaType; limit?: number; offset?: number } = {},
  ) {
    const albumWhere = await this.albumVisibilityFilter(user);
    const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);

    const where: Prisma.MediaItemWhereInput = {
      album: albumWhere,
      ...(opts.type ? { type: opts.type } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.mediaItem.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          album: { select: { id: true, slug: true, title: true } },
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.mediaItem.count({ where }),
    ]);

    return {
      total,
      limit,
      offset,
      items: items.map((it) => ({
        ...it,
        fileSizeBytes: it.fileSizeBytes.toString(),
      })),
    };
  }

  async getGlobalStats(user: RequestUser) {
    await this.assertCanManage(user);
    const [albumsCount, itemsCount, downloadsCount, topItems] =
      await Promise.all([
        this.prisma.mediaAlbum.count(),
        this.prisma.mediaItem.count(),
        this.prisma.mediaItemDownload.count(),
        this.prisma.mediaItem.findMany({
          orderBy: { downloads: { _count: "desc" } },
          take: 5,
          include: {
            album: { select: { id: true, slug: true, title: true } },
            _count: { select: { downloads: true } },
          },
        }),
      ]);
    return {
      albumsCount,
      itemsCount,
      downloadsCount,
      topDownloaded: topItems.map((it) => ({
        id: it.id,
        title: it.title,
        albumTitle: it.album.title,
        albumSlug: it.album.slug,
        downloads: it._count.downloads,
        thumbnailUrl: it.thumbnailUrl,
      })),
    };
  }
}
