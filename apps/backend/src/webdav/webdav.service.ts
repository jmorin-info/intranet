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
import { marked } from "marked";
import TurndownService from "turndown";

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

  /**
   * Vérifie que la fonctionnalité WebDAV est globalement activée pour
   * l'instance via AppConfig (clé `webdav.enabled`). Default false :
   * l'admin doit activer explicitement la feature pour TOUTE l'instance.
   *
   * Doublé par `User.webdavEnabled` per-user (cf. ensureUserAllowed).
   */
  private async isFeatureEnabled(): Promise<boolean> {
    const cfg = await this.prisma.appConfig.findUnique({
      where: { key: "webdav.enabled" },
    });
    if (!cfg) return false;
    // AppConfig.value est text mais contient du JSON. Plusieurs formats
    // historiques tolérés : "true", "false", "{\"enabled\":true}", "1", "0".
    const raw = (cfg.value || "").trim();
    if (!raw) return false;
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "boolean") return parsed;
      if (parsed && typeof parsed === "object" && "enabled" in parsed) {
        return Boolean((parsed as { enabled?: unknown }).enabled);
      }
    } catch {
      // ignore
    }
    return false;
  }

  /**
   * Vérifie que (a) la feature globale est activée et (b) le user
   * a la permission `webdavEnabled = true`. Lève ForbiddenException sinon.
   */
  private async ensureUserAllowed(userId: string): Promise<void> {
    const featureOn = await this.isFeatureEnabled();
    if (!featureOn) {
      throw new ForbiddenException(
        "WebDAV est désactivé sur cette instance (admin > AppConfig > webdav.enabled).",
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { webdavEnabled: true, deletedAt: true, isActive: true },
    });
    if (!user || user.deletedAt || !user.isActive) {
      throw new ForbiddenException("Utilisateur introuvable ou désactivé.");
    }
    if (!user.webdavEnabled) {
      throw new ForbiddenException(
        "L'accès WebDAV n'est pas activé pour ton compte. Demande à un administrateur.",
      );
    }
  }

  // -- Token management ------------------------------------------------------

  /**
   * Mint un nouveau token WebDAV. Le token clair n'est retourné qu'une fois.
   * Révocable via {@link revokeAllTokens} ou {@link revokeToken}.
   *
   * Refuse si la feature globale est OFF ou si le user n'a pas
   * `User.webdavEnabled = true`.
   */
  async createToken(
    userId: string,
    label?: string,
  ): Promise<{ token: string; expiresAt: Date; id: string }> {
    await this.ensureUserAllowed(userId);
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
    // Garde-cohérence : si la feature globale est OFF ou si l'utilisateur n'a
    // pas la permission, on lève 403 ici aussi pour que le frontend (page
    // /profile/integrations) puisse afficher le bon bandeau pédagogique
    // dès l'arrivée — sinon il devrait attendre la première tentative de
    // mint pour découvrir l'état.
    await this.ensureUserAllowed(userId);
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

    // Refus systématique si la feature globale est OFF (cluster-wide kill switch).
    const featureOn = await this.isFeatureEnabled();
    if (!featureOn) return null;

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
        webdavEnabled: true,
      },
    });
    if (!user || user.deletedAt || !user.isActive) return null;
    // Refus per-user : même si le user a un token valide, l'admin peut
    // désactiver son accès WebDAV (offboarding, audit, etc.).
    if (!user.webdavEnabled) return null;

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
    // normalizePath retourne "" pour la racine — on uniformise sur "/" en interne.
    const norm = this.normalizePath(pathPrefix);
    const cleaned = norm === "" ? "/" : norm;
    const [pages, ghosts, ghostFiles] = await Promise.all([
      this.prisma.wikiPage.findMany({
        where: { authorId: userId, isPublished: true },
        select: {
          id: true,
          title: true,
          slug: true,
          category: true,
          content: true,
          updatedAt: true,
          createdAt: true,
          webdavFolder: true,
          webdavFilename: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.getGhostFolders(userId),
      this.getGhostFiles(userId),
    ]);

    // Calcule le "display folder" et "display filename" pour chaque page :
    //   - prioritairement les noms WebDAV originaux (préservent espaces/accents)
    //   - sinon fallback sur catégorie slugifiée + slug (legacy pré-migration)
    const displayPathFor = (
      p: (typeof pages)[number],
    ): { folder: string; filename: string; absPath: string } => {
      const folder =
        (p.webdavFolder && p.webdavFolder.trim()) ||
        this.folderName(p.category) ||
        DEFAULT_FOLDER;
      const filename = (p.webdavFilename && p.webdavFilename.trim()) || p.slug;
      const absPath = `/${folder}/${filename}.md`;
      return { folder, filename, absPath };
    };

    // Index des pages par chemin display absolu (pour lookup rapide)
    const pagesByPath = new Map<string, (typeof pages)[number]>();
    const allFolders = new Set<string>();
    for (const p of pages) {
      const { folder, absPath } = displayPathFor(p);
      pagesByPath.set(absPath, p);
      allFolders.add(`/${folder}`);
    }

    // Tous les dossiers connus (chemins normalisés sans trailing slash) :
    //   - racine "/"
    //   - chaque dossier dérivé d'une page wiki
    //   - chaque ghost folder utilisateur
    const allDirs = new Set<string>(["/"]);
    for (const f of allFolders) allDirs.add(f);
    for (const g of ghosts) allDirs.add(g);

    const dirNode = (path: string): VaultNode => ({
      type: "directory",
      path: path === "/" ? "/" : `${path}/`,
      name: path === "/" ? "" : (path.split("/").pop() ?? ""),
      modified: new Date().toISOString(),
    });
    const childPrefix = (parent: string): string =>
      parent === "/" ? "/" : `${parent}/`;
    const isDirectChild = (parent: string, candidate: string): boolean => {
      if (candidate === parent) return false;
      const pref = childPrefix(parent);
      if (!candidate.startsWith(pref)) return false;
      const rest = candidate.slice(pref.length);
      return rest.length > 0 && !rest.includes("/");
    };

    // Ghost file direct ?
    if (cleaned in ghostFiles) {
      const content = ghostFiles[cleaned]!;
      const name = cleaned.split("/").pop() || cleaned;
      return [
        {
          type: "file",
          path: cleaned,
          name,
          size: Buffer.byteLength(content, "utf8"),
          modified: new Date().toISOString(),
          created: new Date().toISOString(),
          etag: `"gf-${Buffer.from(cleaned).toString("hex").slice(0, 16)}"`,
          content,
        },
      ];
    }

    // Page wiki directe (chemin display) ?
    if (/\.md$/i.test(cleaned) && pagesByPath.has(cleaned)) {
      const page = pagesByPath.get(cleaned)!;
      const { folder, filename } = displayPathFor(page);
      const md = this.toMarkdown(page);
      return [
        {
          type: "file",
          path: cleaned,
          name: `${filename}.md`,
          size: Buffer.byteLength(md, "utf8"),
          modified: page.updatedAt.toISOString(),
          created: page.createdAt.toISOString(),
          etag: this.etag(page.id, page.updatedAt),
          content: md,
        },
      ];
    }

    // Le chemin .md ne matche aucune page → 404
    if (/\.md$/i.test(cleaned)) {
      throw new NotFoundException("File not found");
    }

    // Cible un dossier
    if (!allDirs.has(cleaned)) {
      throw new NotFoundException("Folder not found");
    }

    const nodes: VaultNode[] = [];
    nodes.push(dirNode(cleaned));

    // Sous-dossiers directs
    for (const d of allDirs) {
      if (isDirectChild(cleaned, d)) nodes.push(dirNode(d));
    }

    // Fichiers .md dont le parent direct = cleaned
    const childPref = childPrefix(cleaned);
    for (const p of pages) {
      const { absPath, filename } = displayPathFor(p);
      if (!absPath.startsWith(childPref)) continue;
      const rest = absPath.slice(childPref.length);
      if (rest.includes("/")) continue;
      const md = this.toMarkdown(p);
      nodes.push({
        type: "file",
        path: absPath,
        name: `${filename}.md`,
        size: Buffer.byteLength(md, "utf8"),
        modified: p.updatedAt.toISOString(),
        created: p.createdAt.toISOString(),
        etag: this.etag(p.id, p.updatedAt),
      });
    }

    // Ghost files dont le parent direct = cleaned
    for (const [path, content] of Object.entries(ghostFiles)) {
      if (!path.startsWith(childPref)) continue;
      const rest = path.slice(childPref.length);
      if (rest.length === 0 || rest.includes("/")) continue;
      nodes.push({
        type: "file",
        path,
        name: rest,
        size: Buffer.byteLength(content, "utf8"),
        modified: new Date().toISOString(),
        created: new Date().toISOString(),
        etag: `"gf-${Buffer.from(path).toString("hex").slice(0, 16)}"`,
      });
    }

    return nodes;
  }

  // -- Vault prefix ----------------------------------------------------------
  // Remotely Save (et clients similaires) préfixent toutes les requêtes par
  // le nom du vault Obsidian. Ex : vault `Obsidian Vault` → toutes les
  // requêtes deviennent `/Obsidian%20Vault/<path>`. Pour permettre à
  // l'utilisateur de voir ses pages wiki existantes (qui sont à la racine),
  // on stocke un préfixe optionnel par utilisateur dans AppConfig. Quand
  // une requête arrive, on retire ce préfixe avant le routage.

  private vaultPrefixKey(userId: string): string {
    return `webdav.vault-prefix.${userId}`;
  }

  /**
   * Lit le préfixe vault pour cet utilisateur. Renvoie null si non configuré.
   * Le préfixe stocké est toujours dans le format `/<name>` sans slash final.
   */
  async getVaultPrefix(userId: string): Promise<string | null> {
    const cfg = await this.prisma.appConfig.findUnique({
      where: { key: this.vaultPrefixKey(userId) },
    });
    if (!cfg?.value) return null;
    const v = cfg.value.trim();
    if (!v) return null;
    // Normalise : doit commencer par "/" et ne pas finir par "/"
    let s = v.startsWith("/") ? v : `/${v}`;
    if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
    return s;
  }

  /**
   * Définit ou efface le préfixe vault. Passer une chaîne vide pour effacer.
   * Validation : pas de path traversal, longueur max 100, caractères safe.
   */
  async setVaultPrefix(
    userId: string,
    prefix: string | null | undefined,
  ): Promise<{ prefix: string | null }> {
    await this.ensureUserAllowed(userId);
    const key = this.vaultPrefixKey(userId);
    const trimmed = (prefix || "").trim();
    if (!trimmed) {
      await this.prisma.appConfig.deleteMany({ where: { key } });
      return { prefix: null };
    }
    if (trimmed.length > 100) {
      throw new BadRequestException("Vault prefix trop long (max 100)");
    }
    if (trimmed.includes("..") || trimmed.includes("\\")) {
      throw new BadRequestException("Caractères interdits dans le préfixe");
    }
    let normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    // Caractères autorisés : alphanum, espace, underscore, tiret, point, slash
    if (!/^\/[a-zA-Z0-9 _\-.\/]+$/.test(normalized)) {
      throw new BadRequestException(
        "Le préfixe ne doit contenir que des lettres, chiffres, espaces, _, -, . et /",
      );
    }
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value: normalized, updatedAt: new Date() },
      update: { value: normalized, updatedAt: new Date() },
    });
    void this.audit.log({
      userId,
      action: "WEBDAV_VAULT_PREFIX_SET",
      resourceType: "AppConfig",
      resourceId: key,
      severity: "INFO",
      metadata: { prefix: normalized },
    });
    return { prefix: normalized };
  }

  /**
   * Retire le préfixe vault d'un chemin si présent. Sinon renvoie le path
   * inchangé. Le path entrant peut être URL-encoded (ex : "%20" pour espace) :
   * on décode pour la comparaison, et on retourne le résultat **décodé**.
   * Le downstream (normalizePath dans listVault/parseFilePath) gère déjà le
   * decode mais l'idempotence est OK.
   */
  applyVaultPrefixStrip(prefix: string | null, vaultPath: string): string {
    if (!prefix) return vaultPath;
    let decoded: string;
    try {
      decoded = decodeURIComponent(vaultPath);
    } catch {
      return vaultPath; // path invalide → on laisse downstream gérer
    }
    if (decoded === prefix || decoded === prefix + "/") return "/";
    if (decoded.startsWith(prefix + "/")) {
      const rest = decoded.slice(prefix.length);
      return rest || "/";
    }
    return vaultPath;
  }

  // -- Ghost folders ---------------------------------------------------------
  // Les dossiers WebDAV créés via MKCOL ne correspondent à aucune entité
  // métier (les "vrais" dossiers sont déduits des catégories WikiPage).
  // Pour que la conformité WebDAV soit suffisante (et notamment pour que
  // Remotely Save / clients équivalents valident leur self-test "MKCOL puis
  // PROPFIND"), on persiste les dossiers vides comme une liste de chemins
  // par utilisateur dans AppConfig (clé `webdav.ghost-folders.<userId>`).
  // Ces ghost folders disparaissent automatiquement quand toutes leurs
  // sous-pages sont supprimées (best-effort, traité dans deleteFile).

  private ghostFoldersKey(userId: string): string {
    return `webdav.ghost-folders.${userId}`;
  }

  async getGhostFolders(userId: string): Promise<string[]> {
    const cfg = await this.prisma.appConfig.findUnique({
      where: { key: this.ghostFoldersKey(userId) },
    });
    if (!cfg?.value) return [];
    try {
      const arr = JSON.parse(cfg.value);
      return Array.isArray(arr)
        ? arr.filter((p): p is string => typeof p === "string")
        : [];
    } catch {
      return [];
    }
  }

  private async writeGhostFolders(
    userId: string,
    folders: string[],
  ): Promise<void> {
    const dedup = Array.from(new Set(folders.filter(Boolean))).sort();
    const key = this.ghostFoldersKey(userId);
    if (dedup.length === 0) {
      await this.prisma.appConfig.deleteMany({ where: { key } });
      return;
    }
    const value = JSON.stringify(dedup);
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value, updatedAt: new Date() },
      update: { value, updatedAt: new Date() },
    });
  }

  /**
   * MKCOL — enregistre un dossier persistant pour cet utilisateur.
   * Idempotent : retourner sans erreur si le dossier existe déjà
   * (ghost OU dérivé d'une catégorie wiki).
   */
  async createFolder(userId: string, vaultPath: string): Promise<void> {
    await this.ensureUserAllowed(userId);
    const norm = this.normalizePath(vaultPath);
    if (!norm || norm === "" || norm === "/") return; // root
    const list = await this.getGhostFolders(userId);
    if (list.includes(norm)) return;
    list.push(norm);
    await this.writeGhostFolders(userId, list);
  }

  // -- Ghost files -----------------------------------------------------------
  // Stockage minimal pour les fichiers non-.md ou à profondeur >2 (que le
  // mapping flat WikiPage ne sait pas représenter). Utilisé essentiellement
  // pour les self-tests Remotely Save / WebDAV clients : create test file →
  // GET → DELETE en quelques millisecondes. Pas destiné à du stockage long.
  // Quota dur : 64 Ko par fichier, 256 Ko total par utilisateur.

  private static readonly GHOST_FILE_MAX = 64 * 1024;
  private static readonly GHOST_FILES_QUOTA = 256 * 1024;

  private ghostFilesKey(userId: string): string {
    return `webdav.ghost-files.${userId}`;
  }

  async getGhostFiles(userId: string): Promise<Record<string, string>> {
    const cfg = await this.prisma.appConfig.findUnique({
      where: { key: this.ghostFilesKey(userId) },
    });
    if (!cfg?.value) return {};
    try {
      const obj = JSON.parse(cfg.value);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof k === "string" && typeof v === "string") out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }

  private async writeGhostFiles(
    userId: string,
    files: Record<string, string>,
  ): Promise<void> {
    const key = this.ghostFilesKey(userId);
    if (Object.keys(files).length === 0) {
      await this.prisma.appConfig.deleteMany({ where: { key } });
      return;
    }
    const value = JSON.stringify(files);
    if (value.length > WebDAVService.GHOST_FILES_QUOTA) {
      throw new BadRequestException(
        `Ghost files quota dépassé (${WebDAVService.GHOST_FILES_QUOTA} octets)`,
      );
    }
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value, updatedAt: new Date() },
      update: { value, updatedAt: new Date() },
    });
  }

  async putGhostFile(
    userId: string,
    vaultPath: string,
    content: string,
  ): Promise<{ created: boolean; etag: string; modified: Date }> {
    await this.ensureUserAllowed(userId);
    const norm = this.normalizePath(vaultPath);
    if (!norm || norm === "/" || norm === "") {
      throw new BadRequestException("Invalid ghost file path");
    }
    if (content.length > WebDAVService.GHOST_FILE_MAX) {
      throw new BadRequestException(
        `Ghost file trop volumineux (max ${WebDAVService.GHOST_FILE_MAX} octets)`,
      );
    }
    const files = await this.getGhostFiles(userId);
    const created = !(norm in files);
    files[norm] = content;
    await this.writeGhostFiles(userId, files);
    const modified = new Date();
    const etag = `"gf-${Buffer.from(norm).toString("hex").slice(0, 16)}-${modified.getTime()}"`;
    return { created, etag, modified };
  }

  async getGhostFile(
    userId: string,
    vaultPath: string,
  ): Promise<{ content: string; modified: Date; etag: string } | null> {
    const norm = this.normalizePath(vaultPath);
    const files = await this.getGhostFiles(userId);
    if (!(norm in files)) return null;
    const modified = new Date();
    const etag = `"gf-${Buffer.from(norm).toString("hex").slice(0, 16)}"`;
    return { content: files[norm]!, modified, etag };
  }

  async deleteGhostFile(userId: string, vaultPath: string): Promise<boolean> {
    const norm = this.normalizePath(vaultPath);
    const files = await this.getGhostFiles(userId);
    if (!(norm in files)) return false;
    delete files[norm];
    await this.writeGhostFiles(userId, files);
    return true;
  }

  /**
   * Supprime un ghost folder (et ses sous-dossiers ghost récursivement).
   * Ne touche pas aux pages wiki — celles-là passent par deleteFile.
   */
  async removeGhostFolder(userId: string, vaultPath: string): Promise<void> {
    const norm = this.normalizePath(vaultPath);
    if (!norm || norm === "/") return;
    const list = await this.getGhostFolders(userId);
    const prefix = norm.endsWith("/") ? norm : norm + "/";
    const filtered = list.filter((p) => p !== norm && !p.startsWith(prefix));
    if (filtered.length === list.length) return;
    await this.writeGhostFolders(userId, filtered);
  }

  /** Récupère un fichier (.md) par son chemin virtuel. */
  async getFile(
    userId: string,
    pathStr: string,
  ): Promise<{ content: string; modified: Date; etag: string }> {
    const { folder, slug, originalFolder, originalFilename } =
      this.parseFilePath(pathStr);
    // Lookup prioritaire par nom WebDAV original ; fallback sur slug+folder.
    const page = await this.prisma.wikiPage.findFirst({
      where: {
        authorId: userId,
        isPublished: true,
        OR: [
          {
            webdavFolder: originalFolder,
            webdavFilename: originalFilename,
          },
          { slug },
        ],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        content: true,
        updatedAt: true,
        createdAt: true,
        webdavFolder: true,
        webdavFilename: true,
      },
    });
    if (!page) throw new NotFoundException("File not found");
    // Vérifie cohérence folder uniquement si on a fallback sur slug
    if (
      !(
        page.webdavFolder === originalFolder &&
        page.webdavFilename === originalFilename
      ) &&
      this.folderName(page.category) !== folder
    ) {
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
    await this.ensureUserAllowed(userId);
    const { folder, slug, originalFolder, originalFilename } =
      this.parseFilePath(pathStr);
    const parsed = this.parseMarkdown(body);

    const titleFromFm =
      typeof parsed.frontmatter.title === "string"
        ? parsed.frontmatter.title.trim()
        : "";
    // Préfère le nom de fichier original (lisible humain) sur le slug ASCII.
    const title = titleFromFm || originalFilename || this.deslugify(slug);

    // Catégorie = nom du dossier ORIGINAL (préserve accents/espaces côté UI),
    // sauf bucket par défaut → null.
    const category = originalFolder === DEFAULT_FOLDER ? null : originalFolder;

    // L'UI wiki rend le `content` via dangerouslySetInnerHTML — il attend
    // donc du HTML. Obsidian envoie du markdown brut + wikilinks [[…]] que
    // marked ne gère pas nativement. On préprocesse puis on convertit.
    const preprocessed = WebDAVService.preprocessObsidianMd(parsed.body || "");
    const html = marked.parse(preprocessed, { async: false }) as string;
    const safeContent = sanitizeRichText(html);

    // Recherche prioritaire par nom WebDAV original (round-trip parfait).
    // Fallback sur slug pour les pages créées via l'UI wiki avant la migration.
    const existing = await this.prisma.wikiPage.findFirst({
      where: {
        authorId: userId,
        OR: [
          {
            webdavFolder: originalFolder,
            webdavFilename: originalFilename,
          },
          { slug },
        ],
      },
      select: { id: true, slug: true, content: true, updatedAt: true },
    });

    // Résolution de conflit slug : si un autre user a déjà un slug `foo` et
    // qu'on en crée un nouveau, slug est @unique global → on suffixe avec
    // un fragment du userId pour garantir l'unicité.
    const finalSlug = existing
      ? existing.slug
      : await this.ensureUniqueSlug(slug, userId);

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
          webdavFolder: originalFolder,
          webdavFilename: originalFilename,
        },
        select: { id: true, updatedAt: true },
      });
      void this.audit.log({
        userId,
        action: "WEBDAV_FILE_UPDATED",
        resourceType: "WikiPage",
        resourceId: existing.id,
        severity: "INFO",
        metadata: { path: pathStr, slug: finalSlug, folder },
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
        slug: finalSlug,
        content: safeContent,
        category,
        authorId: userId,
        isPublished: true,
        visibility: "PRIVATE",
        webdavFolder: originalFolder,
        webdavFilename: originalFilename,
      },
      select: { id: true, updatedAt: true },
    });
    void this.audit.log({
      userId,
      action: "WEBDAV_FILE_CREATED",
      resourceType: "WikiPage",
      resourceId: created.id,
      severity: "INFO",
      metadata: { path: pathStr, slug: finalSlug, folder },
    });
    return {
      created: true,
      etag: this.etag(created.id, created.updatedAt),
      modified: created.updatedAt,
    };
  }

  /**
   * Garantit l'unicité du slug (contrainte `slug @unique` sur WikiPage).
   * Si le slug existe déjà (autre user ou ancienne page), suffixe avec un
   * fragment du userId. Si toujours collision (ultra rare), on incrémente.
   */
  private async ensureUniqueSlug(
    slug: string,
    userId: string,
  ): Promise<string> {
    const exists = await this.prisma.wikiPage.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists) return slug;
    const suffix = userId.replace(/-/g, "").slice(0, 6);
    const candidate = `${slug}-${suffix}`;
    const conflict = await this.prisma.wikiPage.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!conflict) return candidate;
    // Très rare : on tente avec un timestamp court
    return `${candidate}-${Date.now().toString(36)}`;
  }

  /**
   * Soft-delete une page wiki. Idempotent : si la page n'existe pas ou est
   * déjà supprimée, on retourne 404 — Obsidian gère ça correctement.
   */
  async deleteFile(userId: string, pathStr: string): Promise<void> {
    const { slug, originalFolder, originalFilename } =
      this.parseFilePath(pathStr);
    // Lookup prioritaire par nom WebDAV original (round-trip), fallback sur slug.
    const page = await this.prisma.wikiPage.findFirst({
      where: {
        authorId: userId,
        OR: [
          {
            webdavFolder: originalFolder,
            webdavFilename: originalFilename,
          },
          { slug },
        ],
      },
      select: { id: true, slug: true },
    });
    if (!page) throw new NotFoundException("File not found");
    await this.prisma.wikiPage.delete({ where: { id: page.id } });
    void this.audit.log({
      userId,
      action: "WEBDAV_FILE_DELETED",
      resourceType: "WikiPage",
      resourceId: page.id,
      severity: "WARN",
      metadata: { path: pathStr, slug: page.slug },
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
    return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Parse un chemin `/<folder>/<slug>.md` et retourne ses composants.
   * Lève BadRequestException si le path n'est pas un fichier .md.
   */
  /**
   * Décompose un chemin WebDAV en `(folder, slug, originalFolder, originalFilename)`.
   *
   * - `originalFolder` / `originalFilename` : noms reçus tels quels (avec
   *   espaces, accents, émojis…) — utilisés pour le round-trip vers Obsidian.
   * - `folder` / `slug` : versions slugifiées kebab-case ASCII utilisées en
   *   DB (slug est `@unique` et sert à `/wiki/<slug>`).
   *
   * Tolère arbitrairement de profondeur de path. Au-delà de 2 niveaux, on
   * applique un fallback : on aplatit en concaténant les segments parent dans
   * `originalFolder` (l'utilisateur peut nesté librement sur Obsidian, le
   * wiki affichera la catégorie reconstruite).
   */
  parseFilePath(pathStr: string): {
    folder: string;
    slug: string;
    originalFolder: string;
    originalFilename: string;
  } {
    const cleaned = this.normalizePath(pathStr);
    if (!cleaned.toLowerCase().endsWith(".md")) {
      throw new BadRequestException("WebDAV: only .md files are supported");
    }
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.length < 1) {
      throw new BadRequestException("WebDAV: invalid path");
    }
    let originalFolder = DEFAULT_FOLDER;
    let originalFilename = parts[parts.length - 1]!;
    if (parts.length >= 2) {
      // Tous les segments avant le filename sont aplatis en folder.
      // Ex : /Cat A/Sous/file.md → folder = "Cat A / Sous"
      originalFolder = parts.slice(0, -1).join(" / ");
    }
    originalFilename = originalFilename.replace(/\.md$/i, "");
    if (originalFilename.length === 0) {
      throw new BadRequestException("WebDAV: empty filename");
    }
    if (originalFilename.length > 200 || originalFolder.length > 200) {
      throw new BadRequestException(
        "WebDAV: filename or folder too long (max 200 chars)",
      );
    }
    // Slugify pour la couche DB (slug @unique en kebab-case ASCII)
    const slug = slugify(originalFilename, { maxLength: 200 }) || "untitled";
    const folder =
      slugify(originalFolder, { maxLength: 100 }) || DEFAULT_FOLDER;
    return { folder, slug, originalFolder, originalFilename };
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
    // page.content est stocké en HTML (l'UI wiki rend du HTML). Pour Obsidian,
    // on convertit HTML → markdown via Turndown pour que l'utilisateur ait
    // une expérience native (pas de balises HTML dans son vault).
    const body = WebDAVService.htmlToMarkdown(page.content || "");
    return `---\n${fmLines}\n---\n\n${body}`;
  }

  /**
   * Pré-traite le markdown Obsidian avant marked.parse :
   *   - retire le frontmatter YAML (déjà extrait par parseMarkdown)
   *   - convertit les wikilinks [[slug|texte]] en liens markdown standards
   *   - convertit les wikilinks simples [[slug]] en liens
   *   - remplace les inclusions d'images Obsidian ![[file]] par un placeholder
   */
  private static preprocessObsidianMd(md: string): string {
    if (!md) return "";
    let s = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
    const slugifyTarget = (t: string): string =>
      t
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    s = s.replace(
      /\[\[([^\]|]+)\|([^\]]+)\]\]/g,
      (_m, target, label) =>
        `[${label.trim()}](/wiki/${slugifyTarget(target)})`,
    );
    s = s.replace(
      /\[\[([^\]]+)\]\]/g,
      (_m, target) => `[${target.trim()}](/wiki/${slugifyTarget(target)})`,
    );
    s = s.replace(
      /!\[\[([^\]]+)\]\]/g,
      (_m, file) => `*[Image Obsidian non synchronisée : ${file.trim()}]*`,
    );
    return s;
  }

  // Singleton Turndown configuré pour mapper proprement les éléments HTML
  // courants — initialisé lazily pour ne pas pénaliser les autres usages
  // de WebDAVService qui ne touchent pas à la conversion.
  private static turndownInstance: TurndownService | null = null;
  private static htmlToMarkdown(html: string): string {
    if (!html) return "";
    if (!WebDAVService.turndownInstance) {
      const td = new TurndownService({
        headingStyle: "atx", // ## H2 plutôt que H2\n----
        codeBlockStyle: "fenced", // ```code``` plutôt qu'indent
        bulletListMarker: "-",
        emDelimiter: "_",
        hr: "---",
      });
      // Préserver les codes inline + blocs (ne pas casser ``` -> indent)
      td.addRule("fencedCodeBlock", {
        filter: (node: any): boolean =>
          node.nodeName === "PRE" &&
          node.firstChild != null &&
          node.firstChild.nodeName === "CODE",
        replacement: (_content: string, node: any): string => {
          const code = node.firstChild?.textContent ?? "";
          const cls = node.firstChild?.className ?? "";
          const lang = cls.match(/language-(\S+)/)?.[1] ?? "";
          return `\n\n\`\`\`${lang}\n${code.replace(/\n$/, "")}\n\`\`\`\n\n`;
        },
      });
      WebDAVService.turndownInstance = td;
    }
    return WebDAVService.turndownInstance.turndown(html);
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
