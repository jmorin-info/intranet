import {
  Controller,
  All,
  Get,
  Post,
  Put,
  Delete,
  Req,
  Res,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { RequestUser } from "../common/interfaces";
import { WebDAVService } from "./webdav.service";
import { VaultNode } from "./webdav.types";

/**
 * Endpoint WebDAV pour la synchronisation Obsidian (item 16, Wave B).
 *
 * Routes :
 *  - `POST /api/v1/users/me/webdav-token`        — mint d'un token (JWT auth)
 *  - `GET /api/v1/users/me/webdav-token`         — liste des tokens du user
 *  - `DELETE /api/v1/users/me/webdav-token`      — révoque tous les tokens
 *  - `DELETE /api/v1/users/me/webdav-token/:id`  — révoque un token précis
 *  - `*    /api/v1/webdav/obsidian/:userId/...`  — endpoint WebDAV (Basic Auth)
 *
 * L'endpoint WebDAV gère les verbes : OPTIONS, PROPFIND, GET, HEAD, PUT,
 * DELETE, MKCOL, MOVE, COPY, LOCK, UNLOCK. Le username Basic = email du user,
 * password = token retourné par POST /users/me/webdav-token.
 */
@Controller()
export class WebDAVController {
  constructor(private readonly webdav: WebDAVService) {}

  // -- Token management ------------------------------------------------------

  @Post("users/me/webdav-token")
  @UseGuards(JwtAuthGuard)
  async createToken(
    @CurrentUser() user: RequestUser,
    @Body() body: { label?: string },
  ) {
    const result = await this.webdav.createToken(user.id, body?.label);
    return {
      token: result.token,
      expiresAt: result.expiresAt,
      id: result.id,
      // Hint pour le client UI : URL d'abonnement à coller dans Obsidian
      url: `/api/v1/webdav/obsidian/${user.id}/`,
      username: user.email,
    };
  }

  @Get("users/me/webdav-token")
  @UseGuards(JwtAuthGuard)
  async listTokens(@CurrentUser() user: RequestUser) {
    return { items: await this.webdav.listTokens(user.id) };
  }

  @Delete("users/me/webdav-token")
  @UseGuards(JwtAuthGuard)
  async revokeAll(@CurrentUser() user: RequestUser) {
    return this.webdav.revokeAllTokens(user.id);
  }

  @Delete("users/me/webdav-token/:id")
  @UseGuards(JwtAuthGuard)
  async revokeOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    await this.webdav.revokeToken(user.id, id);
    return { success: true };
  }

  /**
   * Préfixe vault Obsidian — utilisé par Remotely Save (auto-préfixe le path
   * avec le nom du vault). Quand renseigné, le serveur strippe ce préfixe
   * avant le routage des requêtes WebDAV. Ex : prefix="Obsidian Vault" →
   * GET /Obsidian Vault/admin-sys/foo.md devient GET /admin-sys/foo.md.
   */
  @Get("users/me/webdav-prefix")
  @UseGuards(JwtAuthGuard)
  async getMyVaultPrefix(@CurrentUser() user: RequestUser) {
    return { prefix: await this.webdav.getVaultPrefix(user.id) };
  }

  @Put("users/me/webdav-prefix")
  @UseGuards(JwtAuthGuard)
  async setMyVaultPrefix(
    @CurrentUser() user: RequestUser,
    @Body() body: { prefix?: string | null },
  ) {
    return this.webdav.setVaultPrefix(user.id, body?.prefix ?? null);
  }

  // -- WebDAV endpoint (Basic auth) -----------------------------------------

  /**
   * Catch-all WebDAV — gère tous les verbes (OPTIONS, PROPFIND, GET, HEAD,
   * PUT, DELETE, MKCOL, MOVE, COPY, LOCK, UNLOCK). Auth = Basic (email +
   * token long-lived). Pas de JWT (Obsidian Remotely Save n'en envoie pas).
   *
   * Wildcard : on capture le path après /webdav/obsidian/:userId via
   * req.originalUrl (NestJS ne gère pas de wildcards dynamiques avec @Param).
   */
  @All("webdav/obsidian/*path")
  @Public()
  @SkipThrottle()
  async handleWebdav(@Req() req: Request, @Res() res: Response): Promise<void> {
    const method = req.method.toUpperCase();

    // --- Authentification Basic ---
    const auth = await this.authenticateRequest(req, res);
    if (!auth) return; // 401 envoyé
    const { user, vaultUserId } = auth;
    let { vaultPath } = auth;

    // Scope strict : la `userId` du path = user authentifié (pas d'accès
    // cross-user, sauf admin si on voulait l'autoriser — ici on refuse).
    if (vaultUserId !== user.id) {
      this.send(res, 403, "Forbidden: vault scope mismatch");
      return;
    }

    // --- Strip vault prefix si configuré ---
    // Permet aux clients (Remotely Save) qui auto-préfixent le path avec le
    // nom du vault Obsidian de voir directement les catégories à la racine.
    const prefix = await this.webdav.getVaultPrefix(user.id);
    if (prefix)
      vaultPath = this.webdav.applyVaultPrefixStrip(prefix, vaultPath);

    try {
      switch (method) {
        case "OPTIONS":
          this.handleOptions(res);
          return;
        case "PROPFIND":
          await this.handlePropfind(req, res, user.id, vaultPath, prefix);
          return;
        case "PROPPATCH":
          // Set props (mtime, custom). On accepte mais sans effet — Obsidian
          // continue à fonctionner avec une réponse "207 Multi-Status".
          this.handleProppatchNoop(res);
          return;
        case "MKCOL":
          // Persiste le dossier comme "ghost folder" pour qu'un PROPFIND
          // immédiat sur le même chemin retourne 207 (et non 404).
          // Indispensable pour les self-tests Remotely Save / autres clients.
          await this.webdav.createFolder(user.id, vaultPath);
          this.send(res, 201, "");
          return;
        case "GET":
        case "HEAD":
          await this.handleGet(req, res, user.id, vaultPath, method === "HEAD");
          return;
        case "PUT":
          await this.handlePut(req, res, user.id, vaultPath);
          return;
        case "DELETE":
          await this.handleDelete(res, user.id, vaultPath);
          return;
        case "COPY":
        case "MOVE":
          await this.handleMove(
            req,
            res,
            user.id,
            vaultPath,
            method === "COPY",
          );
          return;
        case "LOCK":
          this.handleLock(res, vaultPath);
          return;
        case "UNLOCK":
          this.send(res, 204, "");
          return;
        default:
          this.send(res, 405, "Method Not Allowed");
          return;
      }
    } catch (err: any) {
      const status =
        err?.status && Number.isInteger(err.status) ? err.status : 500;
      this.send(res, status, err?.message || "WebDAV error", "text/plain");
    }
  }

  /**
   * Lit le body brut de la requête PUT — bypass nécessaire car le body
   * parser global de Nest (json/urlencoded) ne couvre pas application/
   * octet-stream ni text/plain (CT typiques pour Obsidian / Remotely Save).
   * Cap de sécurité à 5 MB pour éviter un OOM via PUT illimité.
   */
  private async readRequestBody(req: Request): Promise<string> {
    const MAX_BODY = 5 * 1024 * 1024;
    // 1. Si rawBody / body déjà parsés (ex : json depuis un client mal configuré)
    const pre = (req as any).rawBody;
    if (Buffer.isBuffer(pre) && pre.length > 0) return pre.toString("utf8");
    if (typeof pre === "string" && pre.length > 0) return pre;
    if (typeof req.body === "string" && req.body.length > 0) return req.body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      return req.body.toString("utf8");
    }
    // 2. Si l'objet `body` a été parsé en objet par body-parser (json),
    // il est probablement vide (`{}`). On retombe sur la lecture stream
    // si elle est encore possible — sinon chaîne vide.
    return await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      const finish = (value: string) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      req.on("data", (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        size += buf.length;
        if (size > MAX_BODY) {
          req.destroy();
          fail(new BadRequestException("PUT body too large (>5MB)"));
          return;
        }
        chunks.push(buf);
      });
      req.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
      req.on("error", fail);
      req.on("close", () => finish(Buffer.concat(chunks).toString("utf8")));
      // Si le stream a déjà été terminé silencieusement, fini ou
      // consommé en amont, on a un timeout léger pour ne pas bloquer.
      setTimeout(() => finish(Buffer.concat(chunks).toString("utf8")), 1500);
    });
  }

  // -- Auth helper -----------------------------------------------------------

  private async authenticateRequest(
    req: Request,
    res: Response,
  ): Promise<{
    user: { id: string; email: string };
    vaultUserId: string;
    vaultPath: string;
  } | null> {
    // Décompose la route : /api/v1/webdav/obsidian/:userId/<rest>
    const url = req.originalUrl || req.url || "";
    // L'API est servie sous le prefix /api/v1 (cf bootstrap setGlobalPrefix).
    const m = /\/webdav\/obsidian\/([^/?#]+)(\/.*)?/.exec(url);
    if (!m) {
      this.send(res, 404, "Not Found");
      return null;
    }
    const vaultUserId = m[1]!;
    let vaultPath = (m[2] ?? "/").split("?")[0] ?? "/";
    if (!vaultPath.startsWith("/")) vaultPath = "/" + vaultPath;

    const authHeader = req.headers.authorization || "";
    if (!authHeader.toLowerCase().startsWith("basic ")) {
      res.set("WWW-Authenticate", 'Basic realm="OMNITECH WebDAV"');
      this.send(res, 401, "Unauthorized");
      return null;
    }
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx < 0) {
      res.set("WWW-Authenticate", 'Basic realm="OMNITECH WebDAV"');
      this.send(res, 401, "Unauthorized");
      return null;
    }
    const email = decoded.slice(0, colonIdx);
    const tokenClear = decoded.slice(colonIdx + 1);

    const user = await this.webdav.authenticate(email, tokenClear);
    if (!user) {
      res.set("WWW-Authenticate", 'Basic realm="OMNITECH WebDAV"');
      this.send(res, 401, "Unauthorized");
      return null;
    }

    return { user, vaultUserId, vaultPath };
  }

  // -- Verb handlers ---------------------------------------------------------

  private handleOptions(res: Response): void {
    res.set({
      Allow:
        "OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, MOVE, COPY, LOCK, UNLOCK",
      DAV: "1, 2",
      "MS-Author-Via": "DAV",
      "Content-Length": "0",
    });
    res.status(200).end();
  }

  private async handlePropfind(
    req: Request,
    res: Response,
    userId: string,
    vaultPath: string,
    prefix: string | null,
  ): Promise<void> {
    const depth = (req.headers.depth as string) || "1";
    let nodes: VaultNode[] = [];
    try {
      nodes = await this.webdav.listVault(userId, vaultPath);
    } catch (err: any) {
      if (
        err?.status === 404 ||
        err?.constructor?.name === "NotFoundException"
      ) {
        this.send(res, 404, "Not Found");
        return;
      }
      throw err;
    }

    if (depth === "0") {
      // On ne renvoie que la ressource de tête
      nodes = nodes.slice(0, 1);
    }

    const xml = this.buildMultiStatus(nodes, prefix);
    res.set({
      "Content-Type": 'application/xml; charset="utf-8"',
      DAV: "1, 2",
    });
    res.status(207).send(xml);
  }

  private handleProppatchNoop(res: Response): void {
    // Réponse 207 minimale acceptant les props sans les modifier
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/</D:href>
    <D:propstat><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
  </D:response>
</D:multistatus>`;
    res.set({ "Content-Type": 'application/xml; charset="utf-8"' });
    res.status(207).send(xml);
  }

  private async handleGet(
    req: Request,
    res: Response,
    userId: string,
    vaultPath: string,
    headOnly: boolean,
  ): Promise<void> {
    // Tente d'abord le ghost file (chemin arbitraire) — fallback sur WikiPage.
    const ghost = await this.webdav.getGhostFile(userId, vaultPath);
    let file: { content: string; modified: Date; etag: string };
    if (ghost) {
      file = ghost;
    } else {
      file = await this.webdav.getFile(userId, vaultPath);
    }
    res.set({
      "Content-Type": ghost
        ? "application/octet-stream"
        : "text/markdown; charset=utf-8",
      "Last-Modified": file.modified.toUTCString(),
      ETag: file.etag,
      "Content-Length": Buffer.byteLength(file.content, "utf8").toString(),
    });
    if (headOnly) {
      res.status(200).end();
      return;
    }
    // 304 Not Modified si If-None-Match correspond
    const inm = req.headers["if-none-match"];
    if (typeof inm === "string" && inm === file.etag) {
      res.status(304).end();
      return;
    }
    res.status(200).send(file.content);
  }

  private async handlePut(
    req: Request,
    res: Response,
    userId: string,
    vaultPath: string,
  ): Promise<void> {
    // Le body parser global (json/urlencoded) ne traite pas application/
    // octet-stream ni text/plain (les content-types typiques d'un PUT WebDAV).
    // → on lit le stream brut directement quand rawBody / req.body sont vides.
    const raw = await this.readRequestBody(req);

    if (raw === null || raw === undefined) {
      throw new BadRequestException("Empty PUT body");
    }

    // Routing :
    //  - .md à profondeur ≤ 2 (`/<cat>/<slug>.md`) → WikiPage (mapping métier)
    //  - sinon → ghost file (stockage AppConfig minimal, max 64 Ko)
    const norm = (vaultPath || "/").replace(/\/+/g, "/");
    const parts = norm.split("/").filter(Boolean);
    const isMdMapping =
      /\.md$/i.test(norm) && parts.length >= 1 && parts.length <= 2;

    if (isMdMapping) {
      const result = await this.webdav.putFile(userId, vaultPath, raw);
      res.set({
        ETag: result.etag,
        "Last-Modified": result.modified.toUTCString(),
      });
      res.status(result.created ? 201 : 204).end();
      return;
    }

    const result = await this.webdav.putGhostFile(userId, vaultPath, raw);
    res.set({
      ETag: result.etag,
      "Last-Modified": result.modified.toUTCString(),
    });
    res.status(result.created ? 201 : 204).end();
  }

  private async handleDelete(
    res: Response,
    userId: string,
    vaultPath: string,
  ): Promise<void> {
    // 1. Si c'est un ghost file (peu importe l'extension), on le supprime.
    const ghostDeleted = await this.webdav.deleteGhostFile(userId, vaultPath);
    if (ghostDeleted) {
      res.status(204).end();
      return;
    }
    // 2. .md → page wiki (mapping métier)
    if (/\.md$/i.test(vaultPath)) {
      try {
        await this.webdav.deleteFile(userId, vaultPath);
        res.status(204).end();
        return;
      } catch (err: any) {
        // Si la page n'existe pas non plus côté wiki, c'est un 404 honnête.
        throw err;
      }
    }
    // 3. Sinon : dossier → ghost folder
    await this.webdav.removeGhostFolder(userId, vaultPath);
    res.status(204).end();
  }

  private async handleMove(
    req: Request,
    res: Response,
    userId: string,
    fromPath: string,
    copy: boolean,
  ): Promise<void> {
    const destination = (req.headers.destination as string) || "";
    if (!destination) {
      throw new BadRequestException("Destination header required");
    }
    // La destination peut être une URL absolue (https://host/api/v1/webdav/...)
    let toPath = destination;
    try {
      const parsed = new URL(
        destination,
        `http://${req.headers.host || "localhost"}`,
      );
      const m = /\/webdav\/obsidian\/[^/]+(\/.*)/.exec(parsed.pathname);
      if (m && m[1]) toPath = m[1];
    } catch {
      // garder destination brute
    }
    await this.webdav.moveFile(userId, fromPath, toPath, copy);
    res.status(201).end();
  }

  /**
   * LOCK : Obsidian Remotely Save n'utilise pas LOCK, mais certains clients
   * macOS (Cyberduck) le tentent. On répond avec un faux lock-token sans
   * persister — last-write-wins gère déjà la concurrence.
   */
  private handleLock(res: Response, vaultPath: string): void {
    const lockToken = `opaquelocktoken:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    res.set({
      "Lock-Token": `<${lockToken}>`,
      "Content-Type": 'application/xml; charset="utf-8"',
    });
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>infinity</D:depth>
      <D:timeout>Second-300</D:timeout>
      <D:locktoken><D:href>${lockToken}</D:href></D:locktoken>
      <D:lockroot><D:href>${this.escapeXml(vaultPath)}</D:href></D:lockroot>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`;
    res.status(200).send(xml);
  }

  // -- XML helpers -----------------------------------------------------------

  private buildMultiStatus(nodes: VaultNode[], prefix: string | null): string {
    const responses = nodes.map((n) => this.nodeToXml(n, prefix)).join("\n");
    return `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
${responses}
</D:multistatus>`;
  }

  private nodeToXml(node: VaultNode, prefix: string | null): string {
    const isDir = node.type === "directory";
    // Réinjecte le préfixe vault dans le href pour que les clients qui
    // valident `href.startsWith(<base>)` (Remotely Save : "after stripping
    // doesn't starts with") trouvent leur compte. On URL-encode pour préserver
    // les espaces (`Obsidian Vault` → `Obsidian%20Vault`).
    const ensureLeadSlash = (s: string) => (s.startsWith("/") ? s : `/${s}`);
    const encodePath = (p: string) =>
      p
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
    let outPath = node.path;
    if (prefix && prefix !== "/") {
      // node.path est "/" pour la racine, "/admin-sys" / "/admin-sys/foo.md"
      // sinon. On préfixe en évitant le double slash.
      outPath =
        node.path === "/"
          ? ensureLeadSlash(prefix) + (isDir ? "/" : "")
          : ensureLeadSlash(prefix) + node.path;
    }
    const relHref = this.escapeXml(encodePath(outPath));
    const lastModified = node.modified
      ? new Date(node.modified).toUTCString()
      : new Date().toUTCString();
    const created = node.created
      ? new Date(node.created).toISOString()
      : new Date().toISOString();
    const propsCommon = `
      <D:creationdate>${created}</D:creationdate>
      <D:getlastmodified>${lastModified}</D:getlastmodified>
      <D:displayname>${this.escapeXml(node.name)}</D:displayname>`;
    const propsFile = isDir
      ? `<D:resourcetype><D:collection/></D:resourcetype>`
      : `<D:resourcetype/>
         <D:getcontentlength>${node.size ?? 0}</D:getcontentlength>
         <D:getcontenttype>text/markdown</D:getcontenttype>
         ${node.etag ? `<D:getetag>${this.escapeXml(node.etag)}</D:getetag>` : ""}`;
    return `  <D:response>
    <D:href>${relHref}</D:href>
    <D:propstat>
      <D:prop>${propsCommon}
        ${propsFile}
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private send(
    res: Response,
    status: number,
    body: string,
    contentType = "text/plain; charset=utf-8",
  ): void {
    if (!res.headersSent) {
      res.set({ "Content-Type": contentType });
      res.status(status).send(body);
    }
  }
}
