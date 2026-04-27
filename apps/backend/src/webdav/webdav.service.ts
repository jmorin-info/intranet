import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { AuditService } from "../audit/audit.service";
import { slugify } from "../common/utils/slugify";
import { sanitizeRichText } from "../common/sanitize";
import { VaultNode, ParsedMarkdown } from "./webdav.types";

const DEFAULT_FOLDER = "_inbox";

const WEBDAV_TOKEN_BYTES = 32;
const WEBDAV_TOKEN_TTL_DAYS = 365;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * WebDAV / Obsidian sync — service applicatif (Wave B item 16).
 *
 * Mapping virtuel :
 *   wiki/<category>/<slug>.md   ↔   WikiPage (filtré par userId)
 *
 * Authentification : Basic Auth (username = email, password = WebDAVToken
 * en clair). Le token est issu de POST /users/me/webdav-token et stocké
 * uniquement via son sha256 hex.
 *
 * Conflits : last-write-wins (pas de merge) — l'horodatage de la dernière
 * modification distante remplace celui de l'intranet ou inversement, selon
 * le sens de la requête (PUT depuis Obsidian → on accepte ; PROPFIND →
 * Obsidian voit le `getlastmodified` côté serveur).
 */
@Injectable()
export class WebDAVService {
  private readonly logger = new Logger(WebDAVService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  // -- Token management ------------------------------------------------------

  /**
   * Mint un nouveau token WebDAV. Le token clair n'est retourné qu'une fois.
   * Révocable via {@link revokeAllTokens} ou {@link revokeToken}.
   */
  async createToken(
    userId: string,
    label?: string,
  ): Promise<{ token: string; expiresAt: Date; id: string }> {
    const tokenClear = this.crypto.generateRandomToken(WEBDAV_TOKEN_BYTES);
    const tokenHash = this.crypto.hashToken(tokenClear);
    const expiresAt = new Date(
      Date.now() + WEBDAV_TOKEN_TTL_DAYS * 24 * 3600 * 1000,
    );

    const created = await (this.prisma as any).webDAVToken.create({
      data: {
        userId,
        tokenHash,
        label: label?.trim().slice(0, 80) || null,
        expiresAt,
      },
    });

    void this.audit.log({
      userId,
      action: "WEBDAV_TOKEN_CREATED",
      resourceType: "WebDAVToken",
      resourceId: created.id,
      severity: "INFO",
      metadata: { label: created.label },
    });

    return { token: tokenClear, expiresAt: created.expiresAt, id: created.id };
  }

  async listTokens(userId: string) {
    const rows = await (this.prisma as any).webDAVToken.findMany({
      where: { userId },
      select: {
        id: true,
        label: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return rows;
  }

  async revokeToken(userId: string, tokenId: string): Promise<void> {
    const token = await (this.prisma as any).webDAVToken.findUnique({
      where: { id: tokenId },
    });
    if (!token || token.userId !== userId) {
      throw new NotFoundException("Token introuvable");
    }
    await (this.prisma as any).webDAVToken.delete({ where: { id: tokenId } });
    void this.audit.log({
      userId,
      action: "WEBDAV_TOKEN_REVOKED",
      resourceType: "WebDAVToken",
      resourceId: tokenId,
      severity: "WARN",
    });
  }

  async revokeAllTokens(userId: string): Promise<{ revoked: number }> {
    const res = await (this.prisma as any).webDAVToken.deleteMany({
      where: { userId },
    });
    void this.audit.log({
      userId,
      action: "WEBDAV_TOKENS_REVOKED_ALL",
      resourceType: "WebDAVToken",
      severity: "WARN",
      metadata: { count: res.count ?? 0 },
    });
    return { revoked: res.count ?? 0 };
  }

  // -- Authentication --------------------------------------------------------

  /**
   * Valide une paire (email, token clair) en Basic Auth. Retourne le user
   * complet ou null si l'auth échoue. Met à jour `lastUsedAt`.
   */
  async authenticate(
    email: string,
    tokenClear: string,
  ): Promise<{
    id: string;
    email: string;
    role: string;
    departmentId: string | null;
    firstName: string;
    lastName: string;
  } | null> {
    if (!email || !tokenClear) return null;

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        role: true,
        departmentId: true,
        firstName: true,
        lastName: true,
        deletedAt: true,
        isActive: true,
      },
    });
    if (!user || user.deletedAt || !user.isActive) return null;

    const tokenHash = this.crypto.hashToken(tokenClear);
    const tokenRow = await (this.prisma as any).webDAVToken.findUnique({
      where: { tokenHash },
    });
    if (!tokenRow) return null;
    if (tokenRow.userId !== user.id) return null;
    if (tokenRow.expiresAt && tokenRow.expiresAt.getTime() < Date.now()) {
      return null;
    }

    // Best-effort lastUsedAt — non bloquant
    void (this.prisma as any).webDAVToken
      .update({
        where: { id: tokenRow.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);

    return {
      id: user.id,
      email: user.email,
      role: user.role as string,
      departmentId: user.departmentId,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  // -- Vault mapping ---------------------------------------------------------

  /**
   * Liste l'arborescence virtuelle pour un user, optionnellement filtrée
   * par préfixe (un dossier).
   *
   * Convention :
   *   - /                    → liste les "dossiers" = catégories distinctes
   *   - /<cat>/              → liste les pages de la catégorie
   *   - /<cat>/<slug>.md     → un fichier
   */
  async listVault(userId: string, pathPrefix: string): Promise<VaultNode[]> {
    const cleaned = this.normalizePath(pathPrefix);
    const pages = await this.prisma.wikiPage.findMany({
      where: {
        authorId: userId,
        isPublished: true,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        content: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const nodes: VaultNode[] = [];

    if (cleaned === "" || cleaned === "/") {
      // Racine → liste les catégories distinctes (uniques + bucket par défaut)
      const cats = new Set<string>();
      for (const p of pages) {
        cats.add(p.category || DEFAULT_FOLDER);
      }
      // Le dossier racine lui-même
      nodes.push({
        type: "directory",
        path: "/",
        name: "",
        modified: new Date().toISOString(),
      });
      for (const cat of Array.from(cats).sort()) {
        const folder = this.folderName(cat);
        nodes.push({
          type: "directory",
          path: `/${folder}/`,
          name: folder,
          modified: new Date().toISOString(),
        });
      }
      return nodes;
    }

    // Décompose <folder>[/<filename>]
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.length === 0) return nodes;

    const folder = parts[0]!;
    const filename = parts[1];

    if (filename) {
      // Cible précise un fichier — retourne juste lui
      const slug = filename.replace(/\.md$/i, "");
      const page = pages.find(
        (p) =>
          p.slug === slug && this.folderName(p.category) === folder,
      );
      if (!page) {
        throw new NotFoundException("File not found");
      }
      const md = this.toMarkdown(page);
      return [
        {
          type: "file",
          path: `/${folder}/${slug}.md`,
          name: `${slug}.md`,
          size: Buffer.byteLength(md, "utf8"),
          modified: page.updatedAt.toISOString(),
          created: page.createdAt.toISOString(),
          etag: this.etag(page.id, page.updatedAt),
          content: md,
        },
      ];
    }

    // Liste un dossier
    const folderPages = pages.filter(
      (p) => this.folderName(p.category) === folder,
    );
    nodes.push({
      type: "directory",
      path: `/${folder}/`,
      name: folder,
      modified: new Date().toISOString(),
    });
    for (const p of folderPages) {
      const md = this.toMarkdown(p);
      nodes.push({
        type: "file",
        path: `/${folder}/${p.slug}.md`,
        name: `${p.slug}.md`,
        size: Buffer.byteLength(md, "utf8"),
        modified: p.updatedAt.toISOString(),
        created: p.createdAt.toISOString(),
        etag: this.etag(p.id, p.updatedAt),
      });
    }
    return nodes;
  }

  /** Récupère un fichier (.md) par son chemin virtuel. */
  async getFile(
    userId: string,
    pathStr: string,
  ): Promise<{ content: string; modified: Date; etag: string }> {
    const { folder, slug } = this.parseFilePath(pathStr);
    const page = await this.prisma.wikiPage.findFirst({
      where: {
        authorId: userId,
        slug,
        isPublished: true,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        content: true,
        updatedAt: true,
        createdAt: true,
      },
    });
    if (!page) throw new NotFoundException("File not found");
    if (this.folderName(page.category) !== folder) {
      throw new NotFoundException("File not found in this folder");
    }
    const md = this.toMarkdown(page);
    return {
      content: md,
      modified: page.updatedAt,
      etag: this.etag(page.id, page.updatedAt),
    };
  }

  /**
   * Crée ou met à jour une page wiki à partir d'un fichier .md uploadé.
   * Last-write-wins : le contenu reçu écrase systématiquement la version
   * actuelle (pas de détection de conflit fine, doc plan v1.4).
   */
  async putFile(
    userId: string,
    pathStr: string,
    body: string,
  ): Promise<{ created: boolean; etag: string; modified: Date }> {
    const { folder, slug } = this.parseFilePath(pathStr);
    const parsed = this.parseMarkdown(body);

    const titleFromFm =
      typeof parsed.frontmatter.title === "string"
        ? parsed.frontmatter.title.trim()
        : "";
    const title = titleFromFm || this.deslugify(slug);

    // Catégorie = nom du dossier (sauf bucket par défaut → null)
    const category = folder === DEFAULT_FOLDER ? null : folder;

    // Le contenu HTML stocké est le markdown natif (les pages wiki acceptent
    // déjà du contenu varié — sanitizeRichText supprime les tags dangereux).
    const safeContent = sanitizeRichText(parsed.body);

    const existing = await this.prisma.wikiPage.findFirst({
      where: { authorId: userId, slug },
      select: { id: true, content: true, updatedAt: true },
    });

    if (existing) {
      // Snapshot version avant overwrite (cohérent avec WikiService.update)
      if (existing.content !== safeContent) {
        await this.prisma.wikiPageVersion.create({
          data: {
            pageId: existing.id,
            content: existing.content,
            title,
            authorId: userId,
            changeLog: "via WebDAV (Obsidian)",
          },
        });
      }
      const updated = await this.prisma.wikiPage.update({
        where: { id: existing.id },
        data: {
          title: sanitizeRichText(title),
          content: safeContent,
          category,
        },
        select: { id: true, updatedAt: true },
      });
      void this.audit.log({
        userId,
        action: "WEBDAV_FILE_UPDATED",
        resourceType: "WikiPage",
        resourceId: existing.id,
        severity: "INFO",
        metadata: { path: pathStr, slug, folder },
      });
      return {
        created: false,
        etag: this.etag(updated.id, updated.updatedAt),
        modified: updated.updatedAt,
      };
    }

    // Création
    const created = await this.prisma.wikiPage.create({
      data: {
        title: sanitizeRichText(title),
        slug,
        content: safeContent,
        category,
        authorId: userId,
        isPublished: true,
        visibility: "PRIVATE",
      },
      select: { id: true, updatedAt: true },
    });
    void this.audit.log({
      userId,
      action: "WEBDAV_FILE_CREATED",
      resourceType: "WikiPage",
      resourceId: created.id,
      severity: "INFO",
      metadata: { path: pathStr, slug, folder },
    });
    return {
      created: true,
      etag: this.etag(created.id, created.updatedAt),
      modified: created.updatedAt,
    };
  }

  /**
   * Soft-delete une page wiki. Idempotent : si la page n'existe pas ou est
   * déjà supprimée, on retourne 404 — Obsidian gère ça correctement.
   */
  async deleteFile(userId: string, pathStr: string): Promise<void> {
    const { slug } = this.parseFilePath(pathStr);
    const page = await this.prisma.wikiPage.findFirst({
      where: { authorId: userId, slug },
      select: { id: true },
    });
    if (!page) throw new NotFoundException("File not found");
    await this.prisma.wikiPage.delete({ where: { id: page.id } });
    void this.audit.log({
      userId,
      action: "WEBDAV_FILE_DELETED",
      resourceType: "WikiPage",
      resourceId: page.id,
      severity: "WARN",
      metadata: { path: pathStr, slug },
    });
  }

  /**
   * MOVE / COPY entre folders. Pour MOVE on update la catégorie + slug.
   * Pour COPY on duplique sans versionner.
   */
  async moveFile(
    userId: string,
    fromPath: string,
    toPath: string,
    copy = false,
  ): Promise<void> {
    const fromParsed = this.parseFilePath(fromPath);
    const toParsed = this.parseFilePath(toPath);

    const page = await this.prisma.wikiPage.findFirst({
      where: { authorId: userId, slug: fromParsed.slug },
    });
    if (!page) throw new NotFoundException("Source file not found");

    const newCategory =
      toParsed.folder === DEFAULT_FOLDER ? null : toParsed.folder;

    if (copy) {
      // Slug doit être unique : on appose -copy si collision détectée
      let candidate = toParsed.slug;
      let i = 1;
      while (
        await this.prisma.wikiPage.findUnique({ where: { slug: candidate } })
      ) {
        candidate = `${toParsed.slug}-copy${i > 1 ? `-${i}` : ""}`;
        i += 1;
        if (i > 50) {
          throw new ConflictException("Slug collision after 50 attempts");
        }
      }
      await this.prisma.wikiPage.create({
        data: {
          title: page.title,
          slug: candidate,
          content: page.content,
          category: newCategory,
          authorId: userId,
          isPublished: page.isPublished,
          visibility: "PRIVATE",
        },
      });
      void this.audit.log({
        userId,
        action: "WEBDAV_FILE_COPIED",
        resourceType: "WikiPage",
        resourceId: page.id,
        severity: "INFO",
        metadata: { from: fromPath, to: toPath, slug: candidate },
      });
      return;
    }

    if (toParsed.slug !== fromParsed.slug) {
      const slugTaken = await this.prisma.wikiPage.findUnique({
        where: { slug: toParsed.slug },
      });
      if (slugTaken) {
        throw new ConflictException("Target slug already exists");
      }
    }

    await this.prisma.wikiPage.update({
      where: { id: page.id },
      data: {
        slug: toParsed.slug,
        category: newCategory,
      },
    });
    void this.audit.log({
      userId,
      action: "WEBDAV_FILE_MOVED",
      resourceType: "WikiPage",
      resourceId: page.id,
      severity: "INFO",
      metadata: { from: fromPath, to: toPath },
    });
  }

  // -- Helpers ---------------------------------------------------------------

  private folderName(category: string | null | undefined): string {
    if (!category) return DEFAULT_FOLDER;
    const slug = slugify(category, { maxLength: 100 });
    return slug || DEFAULT_FOLDER;
  }

  private etag(id: string, modified: Date): string {
    // ETag faible : <id>-<timestamp> — suffit à Obsidian Remotely Save
    return `W/"${id}-${modified.getTime()}"`;
  }

  private deslugify(slug: string): string {
    return slug
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Parse un chemin `/<folder>/<slug>.md` et retourne ses composants.
   * Lève BadRequestException si le path n'est pas un fichier .md.
   */
  parseFilePath(pathStr: string): { folder: string; slug: string } {
    const cleaned = this.normalizePath(pathStr);
    if (!cleaned.toLowerCase().endsWith(".md")) {
      throw new BadRequestException("WebDAV: only .md files are supported");
    }
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.length < 1 || parts.length > 2) {
      throw new BadRequestException("WebDAV: invalid path depth");
    }
    let folder = DEFAULT_FOLDER;
    let filename = parts[0]!;
    if (parts.length === 2) {
      folder = parts[0]!;
      filename = parts[1]!;
    }
    const slug = filename.replace(/\.md$/i, "");
    if (!/^[a-z0-9-]{1,200}$/i.test(slug)) {
      throw new BadRequestException(
        "WebDAV: slug must match [a-z0-9-]{1,200}",
      );
    }
    if (!/^[a-z0-9_-]{1,100}$/i.test(folder)) {
      throw new BadRequestException(
        "WebDAV: folder must match [a-z0-9_-]{1,100}",
      );
    }
    return { folder, slug };
  }

  /**
   * Normalise un chemin URL — supprime préfixes, decode URL, collapse "/".
   * Refuse toute traversal (.., ./, double-slash).
   */
  normalizePath(p: string): string {
    if (!p) return "";
    let s = p;
    try {
      s = decodeURIComponent(s);
    } catch {
      throw new BadRequestException("Invalid path encoding");
    }
    if (s.includes("..") || s.includes("\\")) {
      throw new ForbiddenException("Path traversal denied");
    }
    s = s.replace(/\/+/g, "/").trim();
    if (!s.startsWith("/")) s = "/" + s;
    if (s.length > 1 && s.endsWith("/")) {
      s = s.slice(0, -1);
    }
    return s === "/" ? "" : s;
  }

  /** Construit le markdown final (frontmatter + corps). */
  private toMarkdown(page: {
    title: string;
    slug: string;
    category?: string | null;
    content: string;
    createdAt: Date;
    updatedAt: Date;
  }): string {
    const fm: Record<string, string> = {
      title: page.title,
      slug: page.slug,
      created: page.createdAt.toISOString(),
      updated: page.updatedAt.toISOString(),
    };
    if (page.category) fm.category = page.category;
    const fmLines = Object.entries(fm)
      .map(([k, v]) => `${k}: ${this.yamlSafe(v)}`)
      .join("\n");
    // Note : page.content est stocké comme HTML "rich-text" dans la DB ;
    // pour les vaults Obsidian on l'expose tel quel — Obsidian parse l'HTML
    // dans les .md sans souci. Lors d'un PUT depuis Obsidian, on récupère
    // du markdown pur qui sera re-stocké inchangé (plus prévisible).
    return `---\n${fmLines}\n---\n\n${page.content}`;
  }

  private yamlSafe(v: string): string {
    if (/[:\n"#]/.test(v) || /^\s|\s$/.test(v)) {
      return JSON.stringify(v);
    }
    return v;
  }

  /**
   * Parse un fichier .md avec frontmatter YAML simple `--- key: value ---`.
   * Tolérant : frontmatter optionnel, valeurs traitées comme strings.
   */
  parseMarkdown(raw: string): ParsedMarkdown {
    const m = FRONTMATTER_RE.exec(raw);
    if (!m) return { frontmatter: {}, body: raw };
    const fmRaw = m[1] ?? "";
    const body = raw.slice(m[0].length);
    const frontmatter: Record<string, unknown> = {};
    for (const line of fmRaw.split(/\r?\n/)) {
      const colonIdx = line.indexOf(":");
      if (colonIdx < 0) continue;
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        try {
          value = JSON.parse(value.replace(/'/g, '"'));
        } catch {
          /* keep raw */
        }
      }
      frontmatter[key] = value;
    }
    return { frontmatter, body };
  }
}
