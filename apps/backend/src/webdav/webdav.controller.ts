import {
  Controller,
  All,
  Get,
  Post,
  Delete,
  Req,
  Res,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
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
  async revokeOne(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
  ) {
    await this.webdav.revokeToken(user.id, id);
    return { success: true };
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
  async handleWebdav(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const method = req.method.toUpperCase();

    // --- Authentification Basic ---
    const auth = await this.authenticateRequest(req, res);
    if (!auth) return; // 401 envoyé
    const { user, vaultUserId, vaultPath } = auth;

    // Scope strict : la `userId` du path = user authentifié (pas d'accès
    // cross-user, sauf admin si on voulait l'autoriser — ici on refuse).
    if (vaultUserId !== user.id) {
      this.send(res, 403, "Forbidden: vault scope mismatch");
      return;
    }

    try {
      switch (method) {
        case "OPTIONS":
          this.handleOptions(res);
          return;
        case "PROPFIND":
          await this.handlePropfind(req, res, user.id, vaultPath);
          return;
        case "PROPPATCH":
          // Set props (mtime, custom). On accepte mais sans effet — Obsidian
          // continue à fonctionner avec une réponse "207 Multi-Status".
          this.handleProppatchNoop(res);
          return;
        case "MKCOL":
          // Création dossier — virtuelle, on accepte (les dossiers sont
          // implicitement matérialisés via la catégorie de la première page).
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
          await this.handleMove(req, res, user.id, vaultPath, method === "COPY");
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
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString(
      "utf8",
    );
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
  ): Promise<void> {
    const depth = (req.headers.depth as string) || "1";
    let nodes: VaultNode[] = [];
    try {
      nodes = await this.webdav.listVault(userId, vaultPath);
    } catch (err: any) {
      if (err?.status === 404 || err?.constructor?.name === "NotFoundException") {
        this.send(res, 404, "Not Found");
        return;
      }
      throw err;
    }

    if (depth === "0") {
      // On ne renvoie que la ressource de tête
      nodes = nodes.slice(0, 1);
    }

    const xml = this.buildMultiStatus(nodes);
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
    const file = await this.webdav.getFile(userId, vaultPath);
    res.set({
      "Content-Type": "text/markdown; charset=utf-8",
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
    const raw =
      (req as any).rawBody && (req as any).rawBody.toString
        ? (req as any).rawBody.toString("utf8")
        : typeof req.body === "string"
          ? req.body
          : Buffer.isBuffer(req.body)
            ? req.body.toString("utf8")
            : JSON.stringify(req.body || "");

    if (!raw || typeof raw !== "string") {
      throw new BadRequestException("Empty PUT body");
    }
    const result = await this.webdav.putFile(userId, vaultPath, raw);
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
    await this.webdav.deleteFile(userId, vaultPath);
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

  private buildMultiStatus(nodes: VaultNode[]): string {
    const responses = nodes
      .map((n) => this.nodeToXml(n))
      .join("\n");
    return `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
${responses}
</D:multistatus>`;
  }

  private nodeToXml(node: VaultNode): string {
    const isDir = node.type === "directory";
    const href = `/api/v1/webdav/obsidian/{user}` + (isDir ? node.path : node.path);
    // {user} sera substitué par le client — on n'a pas l'userId ici dans le
    // contexte Nest. En pratique on peut laisser path relatif ; les clients
    // WebDAV tolèrent les hrefs relatifs au request URL.
    void href;
    const relHref = this.escapeXml(node.path);
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
