import { BadRequestException, InternalServerErrorException, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import sharp from "sharp";
import { avatarAborted, avatarDecodeBudget } from "./avatar-budget";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16 * 1024 * 1024;
const OUTPUT_DIMENSION = 512;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORMAT_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const logger = new Logger("AvatarUpload");

interface AvatarFile {
  buffer: Buffer;
  mimetype: string;
}

interface AvatarStore {
  readCurrentAvatar(): Promise<string | null>;
  saveAvatar(avatarUrl: string): Promise<unknown>;
}

interface AvatarOptions {
  storagePath: string;
  createId?: () => string;
  signal?: AbortSignal;
}

export async function encodeAvatar(file?: AvatarFile, signal?: AbortSignal): Promise<Buffer> {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    throw new BadRequestException("Aucune image fournie");
  }
  if (file.buffer.length > AVATAR_MAX_BYTES) {
    throw new BadRequestException("L’image ne doit pas dépasser 2 Mo");
  }
  if (!AVATAR_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestException("Formats acceptés : JPEG, PNG et WebP");
  }
  const input = file.buffer;
  const signatureMime = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff
      ? "image/jpeg"
      : input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : null;
  if (signatureMime !== file.mimetype) {
    throw new BadRequestException("Le contenu de l’image ne correspond pas au format annoncé");
  }
  return avatarDecodeBudget.run(async () => {
    try {
      const image = sharp(file.buffer, {
        limitInputPixels: MAX_PIXELS,
        failOn: "warning",
        animated: false,
      });
      const metadata = await image.metadata();
      avatarAborted(signal);
      if (
        !metadata.format ||
        FORMAT_MIME[metadata.format] !== file.mimetype ||
        !metadata.width ||
        !metadata.height ||
        metadata.width > MAX_DIMENSION ||
        metadata.height > MAX_DIMENSION ||
        (metadata.pages ?? 1) > 1
      ) {
        throw new Error("Unsupported raster format or dimensions");
      }
      // Decode every pixel and write a fresh raster. Original metadata, appended
      // HTML and the client filename never enter the publicly served file.
      return await image
        .rotate()
        .resize(OUTPUT_DIMENSION, OUTPUT_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85, effort: 4 })
        .toBuffer();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        "Image invalide : JPEG, PNG ou WebP fixe, dimensions maximales 4096 × 4096 pixels",
      );
    }
  }, signal);
}

function ownedAvatarPath(
  storagePath: string,
  userId: string,
  avatarUrl: string | null,
): string | null {
  if (!avatarUrl?.startsWith("/storage/avatars/")) return null;
  const filename = avatarUrl.slice("/storage/avatars/".length);
  const extension = /\.(?:jpe?g|png|webp)$/i.exec(filename)?.[0];
  if (!extension) return null;
  const stem = filename.slice(0, -extension.length);
  if (
    stem !== userId &&
    !(stem.startsWith(`${userId}-`) && UUID.test(stem.slice(userId.length + 1)))
  ) {
    return null;
  }
  return path.join(storagePath, filename);
}

async function unlinkOwnedFile(filename: string): Promise<void> {
  try {
    await fs.unlink(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn("Nettoyage différé d’un fichier avatar");
    }
  }
}

export async function publishAvatar(
  userId: string,
  file: AvatarFile | undefined,
  store: AvatarStore,
  options: AvatarOptions,
): Promise<{ avatarUrl: string }> {
  if (!UUID.test(userId)) {
    throw new BadRequestException("Identifiant utilisateur invalide");
  }
  const encoded = await encodeAvatar(file, options.signal);
  const previousAvatar = await store.readCurrentAvatar();
  avatarAborted(options.signal);
  const directory = path.resolve(options.storagePath);
  await fs.mkdir(directory, { recursive: true });
  const directoryInfo = await fs.lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw new InternalServerErrorException("Stockage des avatars indisponible");
  }
  const temporary = path.join(directory, `.avatar-${randomUUID()}.tmp`);
  let temporaryCreated = false;
  let published: string | undefined;
  let avatarUrl: string | undefined;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    temporaryCreated = true;
    try {
      await handle.writeFile(encoded);
    } finally {
      await handle.close();
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const id = (options.createId ?? randomUUID)();
      if (!UUID.test(id)) throw new Error("Invalid server-generated avatar ID");
      const filename = `${userId}-${id}.webp`;
      const candidate = path.join(directory, filename);
      try {
        // Linking a complete private temporary file publishes atomically and
        // refuses collisions, including symlinks. No existing avatar is replaced.
        await fs.link(temporary, candidate);
        published = candidate;
        avatarUrl = `/storage/avatars/${filename}`;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    if (!published || !avatarUrl) {
      throw new InternalServerErrorException("Impossible de publier l’avatar");
    }
    try {
      avatarAborted(options.signal);
    } catch (error) {
      await unlinkOwnedFile(published);
      throw error;
    }
    try {
      await store.saveAvatar(avatarUrl);
    } catch (error) {
      // A network error may arrive after the DB committed. Keep the raster if
      // its reference is confirmed, or if the DB outcome cannot be determined.
      try {
        if ((await store.readCurrentAvatar()) !== avatarUrl) {
          await unlinkOwnedFile(published);
        }
      } catch {
        logger.warn("Avatar conservé : résultat de l’écriture en base incertain");
      }
      throw error;
    }
    const previousPath = ownedAvatarPath(directory, userId, previousAvatar);
    if (previousPath && previousPath !== published) {
      try {
        // Remove only the captured predecessor. A directory-wide sweep could
        // delete another concurrent upload before its DB write commits.
        if ((await store.readCurrentAvatar()) !== previousAvatar) {
          await unlinkOwnedFile(previousPath);
        }
      } catch {
        logger.warn("Ancien avatar conservé : contrôle en base indisponible");
      }
    }
    return { avatarUrl };
  } finally {
    if (temporaryCreated) await unlinkOwnedFile(temporary);
  }
}
