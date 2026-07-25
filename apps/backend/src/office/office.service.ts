import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";
import { UserRole, ROLE_HIERARCHY } from "../common/enums";
import { RequestUser } from "../common/interfaces";
import * as crypto from "crypto";
import * as fs from "fs";

/**
 * OnlyOffice Docs Server integration service.
 *
 * Expose un service qui génère la configuration d'édition OnlyOffice à passer
 * à l'API Document Editor JS (iframe). Signe les config via JWT avec le même
 * secret que celui configuré dans OnlyOffice Docs Server.
 *
 * Configuration requise (.env) :
 *   ONLYOFFICE_ENABLED=true
 *   ONLYOFFICE_DOCUMENT_SERVER_URL=http://localhost:8082
 *   ONLYOFFICE_JWT_SECRET=changeme
 *   ONLYOFFICE_INTERNAL_URL=http://intranet-backend:3000  (URL backend telle que vue par OnlyOffice Docs)
 *
 * Déploiement OnlyOffice Community :
 *   docker run -d --name onlyoffice -p 8082:80 \
 *     -e JWT_SECRET=<même valeur que ONLYOFFICE_JWT_SECRET> \
 *     onlyoffice/documentserver:latest
 */
@Injectable()
export class OfficeService {
  private readonly logger = new Logger(OfficeService.name);

  /**
   * BUG FIX #3 — Idempotence / concurrence.
   * OnlyOffice peut émettre plusieurs callbacks quasi-simultanés pour un même
   * document (status=2 ready-to-save suivi d'un status=6 force-save, ou deux
   * force-save depuis des co-auteurs différents). Sans verrou applicatif, on
   * crée plusieurs `DocumentVersion` redondantes et on risque un TOCTOU sur
   * `currentVersionId`.
   *
   * On utilise un verrou in-memory par `documentId` (et non par callback key)
   * car la key OnlyOffice intègre un time-bucket qui change toutes les 10 min.
   * Les appels concurrents sur un doc déjà en cours de save sont refusés avec
   * `{error: 0}` (retry-able côté OnlyOffice : le prochain force-save ramassera
   * les modifs). Note: purement in-memory → ne protège pas un backend en
   * cluster ; une vraie solution horizontale nécessite un Redis SETNX.
   */
  private readonly savingDocuments = new Set<string>();

  private readonly enabled: boolean;
  private readonly documentServerUrl: string;
  private readonly jwtSecret: string;
  /**
   * Si `true`, on autorise le backend à émettre des configs NON signées
   * (i.e. `ONLYOFFICE_JWT_SECRET` vide). À n'utiliser QUE si le conteneur
   * Docs Server a `JWT_ENABLED=false`. Sinon le canvas restera vide.
   */
  private readonly allowUnsigned: boolean;
  /**
   * Secret indépendant utilisé pour signer les tokens d'accès fichier
   * OnlyOffice → backend. Ne doit PAS être `ONLYOFFICE_JWT_SECRET` (qui est
   * partagé avec le Docs Server) car OnlyOffice ne signe pas nos URL.
   */
  private readonly fileTokenSecret: string;
  private readonly internalBackendUrl: string;
  /**
   * URL du Docs Server telle que vue depuis le BACKEND (réseau interne).
   * Sert exclusivement à la liste blanche anti-SSRF des URLs de téléchargement
   * fournies dans les callbacks OnlyOffice (`callbackData.url`).
   */
  private readonly internalDsUrl: string;

  /**
   * Tri chronologique des versions utilisé par TOUS les endpoints d'historique.
   * `id` en tie-breaker : un overwrite de brouillon ne change pas `createdAt`,
   * deux versions peuvent donc partager la même seconde — sans clé secondaire,
   * l'ordinal renvoyé par `getHistory` et celui recalculé par
   * `getHistoryVersionData` pourraient diverger.
   */
  private static readonly HISTORY_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];

  /** Format de date attendu par DocsAPI pour l'historique : `YYYY-MM-DD HH:mm:ss`. */
  private static formatHistoryDate(date: Date): string {
    return date.toISOString().replace("T", " ").slice(0, 19);
  }

  /** Cache 30s du résultat de disponibilité (healthcheck DS). */
  private availabilityCache: {
    at: number;
    value: { available: boolean; reason?: string };
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jwtService: JwtService,
    // BUG FIX #6 — AuditService est injecté @Optional() pour ne pas casser les
    // tests unitaires existants qui n'ont pas besoin de l'auditer. AuditModule
    // est @Global(), donc en runtime Nest l'injecte toujours.
    @Optional() private readonly audit?: AuditService,
  ) {
    this.enabled = process.env.ONLYOFFICE_ENABLED === "true";
    this.documentServerUrl = (
      process.env.ONLYOFFICE_DOCUMENT_SERVER_URL || "http://localhost:8082"
    ).replace(/\/$/, "");
    this.jwtSecret = process.env.ONLYOFFICE_JWT_SECRET || "";
    this.allowUnsigned = process.env.ONLYOFFICE_ALLOW_UNSIGNED === "true";
    this.fileTokenSecret =
      process.env.JWT_ACCESS_SECRET || process.env.ONLYOFFICE_JWT_SECRET || "insecure-dev-only";

    // L'URL du backend telle que vue depuis OnlyOffice Docs (conteneur → conteneur en Docker).
    // On retire un trailing `/api` éventuel et un slash final pour éviter les URLs doublées
    // type `http://backend:3000/api/api/office/file`.
    const rawInternal =
      process.env.ONLYOFFICE_INTERNAL_URL || process.env.APP_URL || "http://localhost:3000";
    this.internalBackendUrl = rawInternal.replace(/\/api\/?$/, "").replace(/\/$/, "");
    this.internalDsUrl = (
      process.env.ONLYOFFICE_INTERNAL_DS_URL || "http://localhost:8082"
    ).replace(/\/$/, "");

    if (this.enabled && !this.jwtSecret) {
      this.logger.warn(
        "OnlyOffice activé mais ONLYOFFICE_JWT_SECRET non défini — si votre Docs Server a JWT activé (défaut depuis v7.2), il rejettera les configs non signées",
      );
    }
    if (this.enabled) {
      this.logger.log(
        `OnlyOffice ready — browser URL=${this.documentServerUrl}, internal backend URL=${this.internalBackendUrl}`,
      );
    }
  }

  /**
   * Retourne les paramètres runtime utilisés par le builder de config.
   * Exposé via /office/status pour diagnostic côté UI.
   */
  getRuntimeInfo() {
    return {
      enabled: this.enabled,
      documentServerUrl: this.documentServerUrl,
      internalBackendUrl: this.internalBackendUrl,
      // Host autorisé (avec documentServerUrl) pour les URLs de téléchargement
      // des callbacks — utile pour diagnostiquer un rejet anti-SSRF.
      internalDsUrl: this.internalDsUrl,
      jwtSigningConfig: Boolean(this.jwtSecret),
      allowUnsigned: this.allowUnsigned,
    };
  }

  getJwtSecret(): string {
    return this.jwtSecret;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getDocumentServerUrl(): string {
    return this.documentServerUrl;
  }

  /**
   * Vérifie la santé du service OnlyOffice Docs Server.
   */
  async healthCheck(): Promise<{
    ok: boolean;
    version?: string;
    message: string;
  }> {
    if (!this.enabled) {
      return {
        ok: false,
        message: "OnlyOffice désactivé (ONLYOFFICE_ENABLED != true)",
      };
    }
    try {
      const response = await fetch(`${this.documentServerUrl}/healthcheck`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return { ok: false, message: `HTTP ${response.status}` };
      }
      const text = await response.text();
      // OnlyOffice retourne "true" ou "false"
      if (text.trim().toLowerCase() === "true") {
        return { ok: true, message: "OnlyOffice Docs Server en ligne" };
      }
      return { ok: false, message: `Healthcheck KO : ${text}` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Disponibilité "légère" de l'éditeur pour l'UI (bouton OnlyOffice,
   * early-return des pages éditeur). Basée sur le healthcheck Docs Server,
   * cachée 30 secondes pour ne pas marteler le DS à chaque rendu.
   */
  async getAvailability(): Promise<{ available: boolean; reason?: string }> {
    const now = Date.now();
    if (this.availabilityCache && now - this.availabilityCache.at < 30_000) {
      return this.availabilityCache.value;
    }
    let value: { available: boolean; reason?: string };
    if (!this.enabled) {
      value = {
        available: false,
        reason: "Éditeur OnlyOffice désactivé côté serveur",
      };
    } else if (!this.jwtSecret && !this.allowUnsigned) {
      // Même garde que buildEditorConfig : sans secret partagé (et sans opt-in
      // explicite au mode non signé), toute ouverture échouerait. On le dit ici
      // pour que l'UI désactive le bouton au lieu d'envoyer sur une page d'erreur.
      value = {
        available: false,
        reason:
          "Éditeur non configuré côté serveur (ONLYOFFICE_JWT_SECRET manquant) — contactez un administrateur",
      };
    } else {
      const health = await this.healthCheck();
      value = health.ok ? { available: true } : { available: false, reason: health.message };
    }
    this.availabilityCache = { at: now, value };
    return value;
  }

  /**
   * Clé de session OnlyOffice STABLE par contenu :
   * `${documentId}-${versionId}-${checksum8}` (8 premiers hex du checksum).
   * Tous les utilisateurs qui ouvrent la même version partagent la même
   * session Docs Server (co-édition temps réel), et la clé ne change que
   * lorsqu'une nouvelle version/contenu est enregistrée. L'invalidation du
   * cache DS se fait explicitement via dropSession() après un save réussi,
   * une restauration ou un bump de version.
   */
  buildSessionKey(documentId: string, version: { id: string; checksum?: string | null }): string {
    const checksum8 = (version.checksum || "").slice(0, 8) || "nochksum";
    return `${documentId}-${version.id}-${checksum8}`;
  }

  /**
   * Anti-SSRF — le backend ne télécharge le fichier modifié QUE depuis le
   * Docs Server (URL publique navigateur OU URL interne). Toute autre origine
   * dans `callbackData.url` est rejetée : sans ce contrôle, un porteur de
   * token de callback valide pourrait faire fetch une URL arbitraire par le
   * backend et injecter son contenu comme version de document.
   */
  isAllowedDownloadUrl(rawUrl: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const allowedHosts = new Set<string>();
    for (const base of [this.documentServerUrl, this.internalDsUrl]) {
      if (!base) continue;
      try {
        allowedHosts.add(new URL(base).host);
      } catch {
        // URL de config invalide — ignorée
      }
    }
    return allowedHosts.has(parsed.host);
  }

  /**
   * Vérifie le JWT ENTRANT émis par le Docs Server sur les callbacks
   * (body.token, sinon header `Authorization: Bearer ...`).
   *
   * - Secret défini (`ONLYOFFICE_JWT_SECRET`) : signature obligatoire ; le
   *   payload vérifié fait AUTORITÉ sur le body (anti-tampering de `url`,
   *   `status`, `key`).
   * - Secret absent (mode unsigned, conteneur JWT_ENABLED=false) : accepté
   *   avec un warn — le token « maison » en query reste la seule barrière.
   */
  verifyIncomingCallbackJwt(
    body: any,
    authorizationHeader?: string,
  ): { ok: boolean; data: any; reason?: string } {
    if (!this.jwtSecret) {
      this.logger.warn(
        "OnlyOffice callback accepté SANS vérification JWT (ONLYOFFICE_JWT_SECRET non défini — mode unsigned)",
      );
      return { ok: true, data: body };
    }

    let token: string | undefined =
      typeof body?.token === "string" && body.token ? body.token : undefined;
    let fromHeader = false;
    if (!token && authorizationHeader?.startsWith("Bearer ")) {
      token = authorizationHeader.slice("Bearer ".length);
      fromHeader = true;
    }
    if (!token) {
      return {
        ok: false,
        data: body,
        reason: "JWT Docs Server manquant (ni body.token ni header Authorization)",
      };
    }

    try {
      const payload = this.jwtService.verify<any>(token, {
        secret: this.jwtSecret,
      });
      // En header, Docs Server enveloppe le callback dans `{ payload: {...} }` ;
      // en body, le token EST le callback signé. Dans les deux cas le contenu
      // vérifié écrase le body brut.
      const verified =
        fromHeader && payload && typeof payload.payload === "object" ? payload.payload : payload;

      // Liaison de PURPOSE — le token doit être un vrai payload de callback DS,
      // pas n'importe quel JWT signé avec ce secret. signConfig() signe la
      // config d'éditeur avec CE MÊME secret et l'expose au navigateur
      // (config.token + callbackUrl) : sans ce contrôle, un éditeur légitime
      // pourrait rejouer sa propre config comme token de callback et piloter
      // status/url/key depuis le body (drop de session tierce, fetch backend
      // arbitraire). On exige donc que le payload VÉRIFIÉ porte lui-même
      // `status` (et `url` pour un save), et on rejette toute forme de payload
      // de configuration (présence de `document`/`editorConfig`).
      if (!verified || typeof verified !== "object") {
        return { ok: false, data: body, reason: "Payload JWT Docs Server vide ou non-objet" };
      }
      if ("document" in verified || "editorConfig" in verified) {
        return {
          ok: false,
          data: body,
          reason: "Payload JWT de configuration rejeté sur un callback (purpose invalide)",
        };
      }
      if (typeof verified.status !== "number") {
        return {
          ok: false,
          data: body,
          reason: "Payload de callback Docs Server sans `status` signé",
        };
      }
      if ((verified.status === 2 || verified.status === 6) && typeof verified.url !== "string") {
        return {
          ok: false,
          data: body,
          reason: "Payload de callback Docs Server sans `url` signée pour un save (status 2/6)",
        };
      }
      // Le payload vérifié fait autorité : status/url/key du body ne survivent
      // au merge que s'ils sont ABSENTS du payload signé — et on vient de
      // garantir que `status` (et `url` pour les saves) y figurent bien.
      return { ok: true, data: { ...body, ...verified } };
    } catch (err) {
      return {
        ok: false,
        data: body,
        reason: `JWT Docs Server invalide: ${err instanceof Error ? err.message : err}`,
      };
    }
  }

  /**
   * Extensions supportées par OnlyOffice Docs (édition + lecture).
   */
  getSupportedExtensions(): {
    editable: string[];
    viewable: string[];
  } {
    return {
      editable: ["docx", "xlsx", "pptx", "odt", "ods", "odp", "txt", "csv"],
      viewable: ["doc", "xls", "ppt", "pdf", "rtf", "epub", "fb2"],
    };
  }

  /**
   * Déduit le type de document OnlyOffice à partir de l'extension.
   * word | cell | slide | pdf
   */
  getDocumentType(extension: string): "word" | "cell" | "slide" | "pdf" {
    const ext = extension.toLowerCase().replace(".", "");
    if (["docx", "doc", "odt", "rtf", "txt", "epub", "fb2"].includes(ext)) return "word";
    if (["xlsx", "xls", "ods", "csv"].includes(ext)) return "cell";
    if (["pptx", "ppt", "odp"].includes(ext)) return "slide";
    if (ext === "pdf") return "pdf";
    return "word";
  }

  /**
   * Génère un token d'accès signé pour qu'OnlyOffice Docs puisse
   * télécharger le fichier depuis notre backend sans passer par le JWT
   * utilisateur. Expire après 4h.
   *
   * BUG FIX #4 — On inclut `documentId` en plus de `documentVersionId` et
   * `userId`, afin que le handler de callback puisse re-vérifier à la
   * sauvegarde que l'utilisateur a encore le droit d'éditer CE document
   * (pas seulement qu'il pouvait l'éditer au moment de l'ouverture). Sans ça,
   * un token non expiré suffit à écrire une nouvelle version même si les
   * droits ont été révoqués entre-temps.
   */
  private generateFileAccessToken(
    documentVersionId: string,
    documentId: string,
    userId: string,
  ): string {
    const payload = {
      purpose: "onlyoffice-file-access",
      documentVersionId,
      documentId,
      userId,
    };
    return this.jwtService.sign(payload, {
      secret: this.fileTokenSecret,
      expiresIn: "4h",
    });
  }

  /**
   * Token de CALLBACK distinct du token fichier : TTL 24h.
   * Docs Server mémorise la callbackUrl à l'ouverture de session et la
   * rappelle à la fermeture — avec le TTL 4h du token fichier, une session
   * ouverte plus de 4h perdait silencieusement son save final.
   */
  private generateCallbackToken(
    documentVersionId: string,
    documentId: string,
    userId: string,
  ): string {
    const payload = {
      purpose: "onlyoffice-callback",
      documentVersionId,
      documentId,
      userId,
    };
    return this.jwtService.sign(payload, {
      secret: this.fileTokenSecret,
      expiresIn: "24h",
    });
  }

  private verifyTokenWithPurposes(
    token: string,
    purposes: string[],
  ): { documentVersionId: string; documentId?: string; userId: string } | null {
    try {
      const payload = this.jwtService.verify<{
        purpose: string;
        documentVersionId: string;
        documentId?: string;
        userId: string;
      }>(token, {
        secret: this.fileTokenSecret,
      });
      if (!purposes.includes(payload.purpose)) return null;
      return {
        documentVersionId: payload.documentVersionId,
        documentId: payload.documentId,
        userId: payload.userId,
      };
    } catch {
      return null;
    }
  }

  /**
   * Vérifie un token d'accès fichier OnlyOffice.
   */
  verifyFileAccessToken(
    token: string,
  ): { documentVersionId: string; documentId?: string; userId: string } | null {
    return this.verifyTokenWithPurposes(token, ["onlyoffice-file-access"]);
  }

  /**
   * Vérifie un token de callback OnlyOffice. Accepte aussi les anciens tokens
   * `onlyoffice-file-access` pour ne pas casser les sessions ouvertes avant
   * un déploiement (leur callbackUrl embarque encore l'ancien format).
   */
  verifyCallbackToken(
    token: string,
  ): { documentVersionId: string; documentId?: string; userId: string } | null {
    return this.verifyTokenWithPurposes(token, ["onlyoffice-callback", "onlyoffice-file-access"]);
  }

  /**
   * Signe la config OnlyOffice avec le secret JWT partagé.
   * OnlyOffice Docs vérifie cette signature avant d'ouvrir un document.
   */
  private signConfig(config: any): string {
    if (!this.jwtSecret) return "";
    return this.jwtService.sign(config, {
      secret: this.jwtSecret,
      expiresIn: "8h",
    });
  }

  /**
   * Charge un document et sa version courante OFFICIELLE :
   * `document.currentVersionId` (maintenu par les transactions de
   * bump/restauration), fallback sur la plus récente par createdAt si le
   * pointeur est null (anciens documents).
   */
  private async loadDocumentWithCurrentVersion(documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    let currentVersion = document.versions[0];
    if (document.currentVersionId) {
      const pointed = await this.prisma.documentVersion.findUnique({
        where: { id: document.currentVersionId },
      });
      if (pointed && pointed.documentId === document.id) {
        currentVersion = pointed;
      }
    }
    if (!currentVersion) {
      throw new NotFoundException("Aucune version disponible pour ce document");
    }

    return { document, currentVersion };
  }

  /**
   * Permission GED explicite (DocumentPermission) valide et non expirée sur un
   * document : cible utilisateur, département (direct ou via UserDepartment)
   * ou rôle. Même règle que `DocumentsService.hasExplicitPermission`.
   */
  private async hasExplicitDocumentPermission(
    userId: string,
    documentId: string,
    role: string,
  ): Promise<boolean> {
    const [user, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      }),
      this.prisma.userDepartment.findMany({
        where: { userId },
        select: { departmentId: true },
      }),
    ]);
    const departmentIds = new Set<string>();
    if (user?.departmentId) departmentIds.add(user.departmentId);
    for (const m of memberships) departmentIds.add(m.departmentId);

    const perm = await this.prisma.documentPermission.findFirst({
      where: {
        documentId,
        OR: [
          { userId },
          ...(departmentIds.size > 0 ? [{ departmentId: { in: Array.from(departmentIds) } }] : []),
          { role },
        ],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
      select: { id: true },
    });
    return perm !== null;
  }

  /**
   * Contrôle d'accès en LECTURE (ISO 27001 A.5.12 classification + A.5.15
   * contrôle d'accès), aligné sur `DocumentsService.findById`.
   *
   * Sans ce contrôle, TOUT utilisateur authentifié pouvait ouvrir n'importe
   * quel document dans l'éditeur (mode view) et surtout récupérer une URL de
   * téléchargement tokenisée — y compris pour un document SECRET dont il
   * n'aurait jamais dû voir la fiche. Les endpoints d'historique
   * (`/office/history/...`) exposent la même surface : ils passent par ici.
   *
   * Bypass (dans l'ordre) : rôle ≥ DIRECTION, propriétaire / relecteur /
   * approbateur du document, permission GED explicite non expirée. Le
   * relecteur et l'approbateur sont explicitement autorisés (ils peuvent avoir
   * à relire un document SECRET dont ils ne sont pas propriétaires — c'est déjà
   * la règle appliquée par `canEdit`).
   */
  async assertCanReadDocument(
    document: {
      id: string;
      ownerId: string;
      reviewerId?: string | null;
      approverId?: string | null;
      status?: string | null;
      classification?: string | null;
      category?: string | null;
      isPublic?: boolean | null;
    },
    currentUser: RequestUser,
  ): Promise<void> {
    const userRole = (currentUser.role || "").toUpperCase() as UserRole;
    const roleLevel = ROLE_HIERARCHY[userRole] ?? 0;
    // ADMIN / SUPER_ADMIN / DIRECTION : accès total
    if (roleLevel >= ROLE_HIERARCHY[UserRole.DIRECTION]) return;
    if (
      document.ownerId === currentUser.id ||
      document.reviewerId === currentUser.id ||
      document.approverId === currentUser.id
    ) {
      return;
    }
    if (await this.hasExplicitDocumentPermission(currentUser.id, document.id, userRole)) {
      return;
    }

    const classification = (document.classification || "INTERNE").toUpperCase();
    const denied = () => {
      this.logger.warn(
        `OnlyOffice: accès en lecture refusé doc=${document.id} user=${currentUser.id} ` +
          `role=${userRole} classification=${classification} status=${document.status}`,
      );
      throw new ForbiddenException("Accès refusé à ce document");
    };

    if (userRole === UserRole.PRESTATAIRE) {
      // Prestataires : uniquement les contrats approuvés ou les docs publics approuvés
      if (
        document.status !== "APPROVED" ||
        (document.category !== "CONTRACT" && !document.isPublic)
      ) {
        denied();
      }
    } else if (userRole === UserRole.COLLABORATEUR) {
      if (document.status !== "APPROVED") denied();
      if (!["PUBLIC", "INTERNE"].includes(classification)) denied();
    } else if (userRole === UserRole.AUDITEUR) {
      if (document.status !== "APPROVED") denied();
      if (classification === "SECRET") denied();
    } else if (userRole === UserRole.REVIEWER) {
      if (classification === "SECRET") denied();
    }
    // MANAGER et au-dessus : accès en lecture (cf. DocumentsService.findById)
  }

  /**
   * Génère la config complète pour ouvrir un document dans OnlyOffice Docs Editor.
   * À passer au JS front `DocsAPI.DocEditor('placeholder', config)`.
   *
   * @param documentId ID d'un Document OMNITECH existant
   * @param currentUser User qui ouvre l'éditeur
   * @param mode 'edit' | 'view'
   */
  async buildEditorConfig(
    documentId: string,
    currentUser: RequestUser,
    mode: "edit" | "view" = "edit",
  ) {
    if (!this.enabled) {
      throw new ForbiddenException("OnlyOffice désactivé");
    }

    // Garde dure contre le cas "canvas vide" silencieux : si OnlyOffice Docs a
    // JWT_ENABLED=true (défaut depuis v7.2) et que le backend ne signe pas ses
    // configs, le Docs Server accepte la connexion initiale (chrome + compteur
    // de pages visibles) mais rejette silencieusement le rendu du document.
    // On bloque tôt avec un message actionnable, sauf si l'admin a
    // explicitement opté pour le mode non signé (ONLYOFFICE_ALLOW_UNSIGNED=true,
    // à n'activer QUE si le conteneur Docs a JWT_ENABLED=false).
    if (this.enabled && !this.jwtSecret && !this.allowUnsigned) {
      throw new ForbiddenException(
        "OnlyOffice est activé mais ONLYOFFICE_JWT_SECRET n'est pas défini dans l'environnement backend. " +
          "Les configs non signées sont silencieusement rejetées par Docs Server v7.2+ (canvas vide). " +
          "Solution : (1) définir ONLYOFFICE_JWT_SECRET avec la même valeur que le conteneur Docs, " +
          "OU (2) démarrer le conteneur avec JWT_ENABLED=false et définir ONLYOFFICE_ALLOW_UNSIGNED=true côté backend.",
      );
    }

    const { document, currentVersion } = await this.loadDocumentWithCurrentVersion(documentId);

    // Contrôle d'accès EN LECTURE avant toute émission de token de
    // téléchargement (le mode view en délivre un lui aussi).
    await this.assertCanReadDocument(document, currentUser);

    // Extraction du nom + extension
    const fileName = currentVersion.fileUrl.split("/").pop() || "document";
    const extensionMatch = fileName.match(/\.([^.?]+)(\?|$)/);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "docx";
    const documentType = this.getDocumentType(extension);

    // Vérifie si le format est éditable par OnlyOffice
    // (les PDF et certains formats legacy sont en lecture seule)
    const { editable } = this.getSupportedExtensions();
    const isFormatEditable = editable.includes(extension);

    // Détermine si l'utilisateur a le droit d'éditer
    const roleLevel = ROLE_HIERARCHY[currentUser.role as UserRole] ?? 0;
    const isOwner = document.ownerId === currentUser.id;
    const isReviewer = document.reviewerId === currentUser.id;
    const isAdmin = roleLevel >= ROLE_HIERARCHY[UserRole.ADMIN];
    // Règles d'édition :
    //   - DRAFT / IN_REVIEW : éditable par owner, reviewer, admin (flux normal)
    //   - APPROVED : éditable par owner ou admin uniquement. Chaque save crée
    //     une version MINEURE (1.1, 1.2…) qui préserve la traçabilité ISO.
    //     Le statut reste APPROVED (living document) et l'approbateur est
    //     notifié. Les acknowledgments antérieurs sont préservés (preuve de
    //     communication de la version N au temps T).
    //   - OBSOLETE / ARCHIVED : lecture seule — il faut d'abord réouvrir
    //     (`POST /documents/:id/reopen`).
    const isEditableStatus =
      document.status === "DRAFT" ||
      document.status === "IN_REVIEW" ||
      (document.status === "APPROVED" && (isOwner || isAdmin));
    const canEdit =
      mode === "edit" && isFormatEditable && (isOwner || isReviewer || isAdmin) && isEditableStatus;

    // Diagnostic structuré pour l'UI : si canEdit=false, dire exactement
    // pourquoi ET proposer une action concrète. Sans ça, OnlyOffice tombe
    // silencieusement en mode « Download » et l'utilisateur ne comprend pas
    // pourquoi il ne peut pas enregistrer.
    let canEditReason: {
      code:
        | "OK"
        | "VIEW_MODE"
        | "FORMAT_READONLY"
        | "NOT_AUTHORIZED"
        | "STATUS_OBSOLETE"
        | "STATUS_ARCHIVED"
        | "STATUS_APPROVED_NOT_OWNER";
      message: string;
      actionHint?: string;
    };
    if (canEdit) {
      canEditReason = { code: "OK", message: "Édition autorisée." };
    } else if (mode !== "edit") {
      canEditReason = {
        code: "VIEW_MODE",
        message: "Éditeur ouvert en lecture seule (mode=view).",
        actionHint: "Ouvrir sans le paramètre ?mode=view pour éditer.",
      };
    } else if (!isFormatEditable) {
      canEditReason = {
        code: "FORMAT_READONLY",
        message: `Le format .${extension} n'est pas modifiable dans OnlyOffice.`,
        actionHint:
          "Uploadez une nouvelle version au format .docx / .xlsx / .pptx pour éditer en ligne.",
      };
    } else if (!(isOwner || isReviewer || isAdmin)) {
      canEditReason = {
        code: "NOT_AUTHORIZED",
        message: "Vous n'êtes ni propriétaire, ni relecteur, ni administrateur de ce document.",
        actionHint:
          "Demandez au propriétaire de vous ajouter comme relecteur, ou contactez un administrateur.",
      };
    } else if (document.status === "OBSOLETE") {
      canEditReason = {
        code: "STATUS_OBSOLETE",
        message: "Ce document est marqué OBSOLETE, l'édition directe est bloquée.",
        actionHint:
          "Réimportez une nouvelle version via « Réimporter » sur la page document — le doc repassera en brouillon.",
      };
    } else if (document.status === "ARCHIVED") {
      canEditReason = {
        code: "STATUS_ARCHIVED",
        message: "Ce document est ARCHIVÉ, l'édition est bloquée.",
        actionHint:
          "Utilisez « Réouvrir » sur la page document pour le repasser en brouillon éditable.",
      };
    } else if (document.status === "APPROVED" && !(isOwner || isAdmin)) {
      canEditReason = {
        code: "STATUS_APPROVED_NOT_OWNER",
        message:
          "Ce document est APPROUVÉ. Seul le propriétaire ou un administrateur peut encore le modifier.",
        actionHint:
          "Pour une révision formelle, utilisez « Réouvrir » ou contactez le propriétaire.",
      };
    } else {
      canEditReason = {
        code: "NOT_AUTHORIZED",
        message: "Édition non autorisée (raison inconnue).",
      };
    }

    if (!canEdit) {
      this.logger.warn(
        `OnlyOffice editor readonly: doc=${document.reference} user=${currentUser.id} role=${currentUser.role} ` +
          `status=${document.status} format=${extension} reason=${canEditReason.code}`,
      );
    }

    // Token d'accès signé pour que OnlyOffice puisse télécharger le fichier
    // (TTL 4h) + token de callback distinct (TTL 24h — voir generateCallbackToken).
    const accessToken = this.generateFileAccessToken(
      currentVersion.id,
      document.id,
      currentUser.id,
    );
    const callbackToken = this.generateCallbackToken(
      currentVersion.id,
      document.id,
      currentUser.id,
    );
    const fileUrl = `${this.internalBackendUrl}/api/v1/office/file?token=${accessToken}`;
    const callbackUrl = `${this.internalBackendUrl}/api/v1/office/callback?token=${callbackToken}`;

    this.logger.debug(`OnlyOffice editor config → doc=${document.reference} ext=${extension}`);

    // Clé de session STABLE par contenu (documentId-versionId-checksum8) :
    // tous les ouvreurs de la même version partagent la même session Docs
    // Server → vraie co-édition temps réel. La clé n'est invalidée que par
    // un nouveau contenu (save/bump/restauration) + dropSession() explicite.
    const key = this.buildSessionKey(document.id, currentVersion);

    const config: any = {
      document: {
        fileType: extension,
        key,
        title: `${document.title} (${document.reference})`,
        url: fileUrl,
        permissions: {
          edit: canEdit,
          download: true,
          print: true,
          review: canEdit,
          comment: canEdit,
        },
      },
      documentType,
      editorConfig: {
        mode: canEdit ? "edit" : "view",
        lang: "fr-FR",
        callbackUrl: canEdit ? callbackUrl : undefined,
        user: {
          id: currentUser.id,
          name: `${currentUser.firstName || ""} ${currentUser.lastName || currentUser.email}`.trim(),
        },
        // Pas de customization.logo : les URLs pointaient sur l'URL interne
        // HTTP du backend → mixed content bloqué dans l'iframe HTTPS (et les
        // assets sont servis par le frontend, pas le backend). Le logo par
        // défaut OnlyOffice est utilisé.
        customization: {
          autosave: true,
          forcesave: true,
          toolbarNoTabs: false,
          hideRightMenu: false,
          uiTheme: "theme-classic-light",
        },
      },
      // Pas de `height`/`width` ici : OnlyOffice utilise alors les dimensions du
      // conteneur DOM, ce qui est plus fiable qu'un '100%' qui peut résoudre à 0px
      // si la chaîne d'ancêtres n'a pas de hauteur calculable.
    };

    // Signe la config AVANT le return. OnlyOffice exige un JWT si JWT_SECRET est
    // défini sur le serveur Docs — et sans token, Docs Server affiche le chrome
    // mais laisse le canvas vide (rejection silencieuse).
    if (this.jwtSecret) {
      config.token = this.signConfig(config);
      if (!config.token) {
        throw new ForbiddenException(
          "Échec de signature de la config OnlyOffice — signConfig() a retourné une chaîne vide.",
        );
      }
    }

    return {
      documentServerUrl: this.documentServerUrl,
      config,
      canEdit,
      canEditReason,
      extension,
      document: {
        id: document.id,
        title: document.title,
        reference: document.reference,
        status: document.status,
        classification: document.classification,
      },
      /**
       * Diagnostic exposé côté UI pour aider à déboguer les cas "barre affichée
       * mais document vide" (= OnlyOffice Docs ne peut pas joindre `fileUrl`).
       * En mode ÉDITION le token est masqué : un token d'accès fichier en clair
       * côté client permettrait de forger des appels /office/file hors éditeur.
       * En lecture seule il reste exposé (lien « tester le téléchargement »).
       */
      diagnostic: {
        internalBackendUrl: this.internalBackendUrl,
        fileUrl: canEdit ? fileUrl.replace(/token=[^&]+/, "token=***") : fileUrl,
        jwtConfigured: Boolean(this.jwtSecret),
      },
    };
  }

  /**
   * Teste si le backend peut joindre sa propre URL interne (celle transmise à
   * OnlyOffice Docs). En Docker, cette URL doit être accessible depuis le
   * conteneur OnlyOffice — si depuis le conteneur backend elle est déjà KO,
   * elle le sera encore plus depuis OnlyOffice. Utile pour diagnostiquer les
   * erreurs de DNS / `host.docker.internal` / noms de services compose.
   */
  async diagnoseInternalReachability(): Promise<{
    ok: boolean;
    internalBackendUrl: string;
    status?: number;
    message: string;
  }> {
    if (!this.enabled) {
      return {
        ok: false,
        internalBackendUrl: this.internalBackendUrl,
        message: "OnlyOffice désactivé",
      };
    }
    try {
      const response = await fetch(`${this.internalBackendUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return {
        ok: response.ok,
        internalBackendUrl: this.internalBackendUrl,
        status: response.status,
        message: response.ok
          ? `Backend joignable via ${this.internalBackendUrl}`
          : `HTTP ${response.status} — URL probablement incorrecte pour le conteneur OnlyOffice`,
      };
    } catch (err) {
      return {
        ok: false,
        internalBackendUrl: this.internalBackendUrl,
        message: `Échec fetch: ${err instanceof Error ? err.message : err}. Vérifiez ONLYOFFICE_INTERNAL_URL (docker: utilisez le nom du service, pas localhost).`,
      };
    }
  }

  /**
   * Vérifie que le secret JWT partagé avec Docs Server est correct, en
   * appelant son endpoint CommandService avec un token signé. Codes retournés
   * par OnlyOffice (https://api.onlyoffice.com/editors/command/) :
   *   0 = ok, 6 = invalid token / JWT mismatch, 5 = command not correct, etc.
   */
  async testCommandService(): Promise<{
    jwtMatch: boolean | "unknown";
    jwtMessage: string;
    httpStatus?: number;
    responseBody?: string;
  }> {
    if (!this.enabled) {
      return { jwtMatch: "unknown", jwtMessage: "OnlyOffice désactivé" };
    }

    const url = `${this.documentServerUrl}/coauthoring/CommandService.ashx`;
    const payload: any = { c: "version" };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Si le backend a un secret, on envoie le body SIGNÉ (format JWT_IN_BODY).
    // Docs Server l'accepte aussi en header Authorization: Bearer.
    if (this.jwtSecret) {
      try {
        const signed = this.jwtService.sign(payload, {
          secret: this.jwtSecret,
          expiresIn: "5m",
        });
        payload.token = signed;
        headers.Authorization = `Bearer ${signed}`;
      } catch (err) {
        return {
          jwtMatch: false,
          jwtMessage: `Échec de signature locale : ${err instanceof Error ? err.message : err}`,
        };
      }
    }
    const bodyToSend = JSON.stringify(payload);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: bodyToSend,
        signal: AbortSignal.timeout(5000),
      });
      const text = await response.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // pas du JSON : probablement un HTML d'erreur
      }

      if (!response.ok) {
        return {
          jwtMatch: "unknown",
          jwtMessage: `HTTP ${response.status} — ${text.slice(0, 200)}`,
          httpStatus: response.status,
          responseBody: text.slice(0, 500),
        };
      }

      if (parsed && typeof parsed.error === "number") {
        if (parsed.error === 0) {
          return {
            jwtMatch: this.jwtSecret ? true : "unknown",
            jwtMessage: this.jwtSecret
              ? "Secret JWT accepté par Docs Server — les configs signées seront rendues correctement."
              : "Docs Server accepte les appels non signés (JWT_ENABLED=false côté conteneur).",
            httpStatus: response.status,
            responseBody: text.slice(0, 500),
          };
        }
        if (parsed.error === 6) {
          return {
            jwtMatch: false,
            jwtMessage:
              "Docs Server a rejeté le token (error=6, invalid JWT). Le secret backend et conteneur ne correspondent pas, " +
              "ou le conteneur a JWT_ENABLED=true mais le backend ne signe pas.",
            httpStatus: response.status,
            responseBody: text.slice(0, 500),
          };
        }
        return {
          jwtMatch: this.jwtSecret ? true : "unknown",
          jwtMessage: `Docs Server a répondu error=${parsed.error} (pas un problème JWT).`,
          httpStatus: response.status,
          responseBody: text.slice(0, 500),
        };
      }

      return {
        jwtMatch: "unknown",
        jwtMessage: `Réponse inattendue : ${text.slice(0, 200)}`,
        httpStatus: response.status,
        responseBody: text.slice(0, 500),
      };
    } catch (err) {
      return {
        jwtMatch: "unknown",
        jwtMessage: `Échec fetch CommandService : ${err instanceof Error ? err.message : err}`,
      };
    }
  }

  /**
   * Force OnlyOffice Docs à dropper une session en cache pour la clé donnée.
   * Utile avant de rouvrir un document — sinon Docs Server peut "restore
   * old session" silencieusement (état corrompu → canvas vide).
   *
   * Docs réf : https://api.onlyoffice.com/editors/command/forcesave (+ drop)
   */
  async dropSession(key: string): Promise<{ ok: boolean; message: string }> {
    if (!this.enabled) {
      return { ok: false, message: "OnlyOffice désactivé" };
    }
    const url = `${this.documentServerUrl}/coauthoring/CommandService.ashx`;
    const payload: any = { c: "drop", key, users: [] };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.jwtSecret) {
      try {
        const signed = this.jwtService.sign(payload, {
          secret: this.jwtSecret,
          expiresIn: "1m",
        });
        payload.token = signed;
        headers.Authorization = `Bearer ${signed}`;
      } catch {
        // on tente quand même non-signé si la signature locale rate
      }
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      });
      const text = await response.text();
      this.logger.debug(
        `dropSession key=${key} → HTTP ${response.status} body=${text.slice(0, 200)}`,
      );
      return { ok: response.ok, message: text };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Appel générique au CommandService du Docs Server (signé si secret défini).
   */
  private async callCommandService(
    payload: Record<string, unknown>,
    timeoutMs = 5000,
  ): Promise<{ httpOk: boolean; error?: number; raw: string }> {
    const url = `${this.documentServerUrl}/coauthoring/CommandService.ashx`;
    const body: any = { ...payload };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.jwtSecret) {
      try {
        const signed = this.jwtService.sign(body, {
          secret: this.jwtSecret,
          expiresIn: "5m",
        });
        body.token = signed;
        headers.Authorization = `Bearer ${signed}`;
      } catch {
        // on tente quand même non-signé si la signature locale rate
      }
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // pas du JSON : probablement un HTML d'erreur
    }
    return {
      httpOk: response.ok,
      error: typeof parsed?.error === "number" ? parsed.error : undefined,
      raw: text,
    };
  }

  /**
   * Déclenche une sauvegarde immédiate de la session en cours via
   * CommandService (c:'forcesave'). Branché sur le Ctrl+S du frontend.
   * Codes DS : 0 = ok, 4 = aucune modification, 1 = clé inconnue, 6 = JWT KO.
   */
  async forceSave(
    documentId: string,
    currentUser: RequestUser,
    clientKey?: string,
  ): Promise<{ ok: boolean; error?: number; message: string }> {
    if (!this.enabled) {
      throw new ForbiddenException("OnlyOffice désactivé");
    }
    const { document, currentVersion } = await this.loadDocumentWithCurrentVersion(documentId);

    const roleLevel = ROLE_HIERARCHY[currentUser.role as UserRole] ?? 0;
    const isOwner = document.ownerId === currentUser.id;
    const isReviewer = document.reviewerId === currentUser.id;
    const isAdmin = roleLevel >= ROLE_HIERARCHY[UserRole.ADMIN];
    if (!(isOwner || isReviewer || isAdmin)) {
      throw new ForbiddenException("Vous n'avez pas les droits d'édition sur ce document");
    }

    // Clé de session : on privilégie celle RÉELLEMENT ouverte dans l'éditeur du
    // navigateur (config.document.key émise au mount), transmise par le
    // frontend. La recalculer depuis la DB échouerait dès le 2e Ctrl+S : après
    // un save la row de version voit son checksum changer, donc buildSessionKey
    // renverrait une clé différente de celle sous laquelle la session DS reste
    // ouverte → « clé inconnue » alors que le document est bel et bien ouvert.
    // On borne au préfixe `${documentId}-` : l'autorisation d'édition est déjà
    // vérifiée ci-dessus et la clé n'est que transmise au Docs Server (au pire
    // un éditeur autorisé force-save une autre session DU MÊME document).
    const key =
      typeof clientKey === "string" && clientKey.startsWith(`${document.id}-`)
        ? clientKey
        : this.buildSessionKey(document.id, currentVersion);
    try {
      const res = await this.callCommandService({
        c: "forcesave",
        key,
        userdata: `ctrl-s:${currentUser.id}`,
      });
      if (!res.httpOk) {
        return {
          ok: false,
          message: `Docs Server injoignable (HTTP) — ${res.raw.slice(0, 200)}`,
        };
      }
      switch (res.error) {
        case 0:
          return {
            ok: true,
            error: 0,
            message: "Sauvegarde forcée demandée au Docs Server",
          };
        case 4:
          return {
            ok: true,
            error: 4,
            message: "Aucune modification à sauvegarder",
          };
        case 1:
          return {
            ok: false,
            error: 1,
            message:
              "Session introuvable côté Docs Server (clé inconnue — le document n'est peut-être plus ouvert)",
          };
        case 6:
          return {
            ok: false,
            error: 6,
            message:
              "Le Docs Server a rejeté le token (secret JWT différent entre backend et conteneur)",
          };
        default:
          return {
            ok: false,
            error: res.error,
            message: `Docs Server a répondu error=${res.error ?? "?"}`,
          };
      }
    } catch (err) {
      return {
        ok: false,
        message: `Échec de l'appel CommandService : ${err instanceof Error ? err.message : err}`,
      };
    }
  }

  /**
   * Historique des versions au format attendu par `docEditor.refreshHistory()`
   * (événement onRequestHistory). `versions` est un mapping parallèle
   * versionNumber → versionId utilisé par le frontend pour les événements
   * onRequestHistoryData / onRequestRestore.
   */
  async getHistory(documentId: string, currentUser: RequestUser) {
    if (!this.enabled) {
      throw new ForbiddenException("OnlyOffice désactivé");
    }
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          orderBy: OfficeService.HISTORY_ORDER,
          include: {
            uploadedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });
    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }
    await this.assertCanReadDocument(document, currentUser);
    if (document.versions.length === 0) {
      throw new NotFoundException("Aucune version disponible pour ce document");
    }
    let currentIndex = document.versions.length - 1;
    if (document.currentVersionId) {
      const pointedIndex = document.versions.findIndex((v) => v.id === document.currentVersionId);
      if (pointedIndex >= 0) currentIndex = pointedIndex;
    }
    this.logger.debug(
      `OnlyOffice history: doc=${document.reference} versions=${document.versions.length} user=${currentUser.id}`,
    );
    return {
      // `version` est un ENTIER (contrat DocsAPI refreshHistory/setHistoryData) :
      // on expose l'ordinal chronologique, pas le numéro métier « 1.2 » qui
      // n'est pas un nombre. Le numéro métier reste dans `versions[].versionNumber`
      // pour l'affichage côté frontend.
      currentVersion: currentIndex + 1,
      history: document.versions.map((v, index) => ({
        key: this.buildSessionKey(document.id, v),
        version: index + 1,
        created: OfficeService.formatHistoryDate(v.createdAt),
        user: {
          id: v.uploadedById,
          name:
            `${v.uploadedBy?.firstName || ""} ${v.uploadedBy?.lastName || ""}`.trim() ||
            v.uploadedBy?.email ||
            "Inconnu",
        },
      })),
      versions: document.versions.map((v, index) => ({
        version: index + 1,
        versionId: v.id,
        versionNumber: v.versionNumber,
        changeLog: v.changeLog,
      })),
    };
  }

  /**
   * Données d'une version pour `docEditor.setHistoryData()` (événement
   * onRequestHistoryData) : fileUrl tokenisée VIEW-ONLY (le token file-access
   * ne permet que GET /office/file ; le callback exige un token dédié et
   * re-vérifie les droits). Signée avec le secret DS si défini.
   */
  async getHistoryVersionData(documentId: string, versionId: string, currentUser: RequestUser) {
    if (!this.enabled) {
      throw new ForbiddenException("OnlyOffice désactivé");
    }
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        deletedAt: true,
        ownerId: true,
        reviewerId: true,
        approverId: true,
        status: true,
        classification: true,
        category: true,
        isPublic: true,
      },
    });
    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }
    await this.assertCanReadDocument(document, currentUser);

    // Ordinal chronologique — DOIT correspondre à celui renvoyé par getHistory
    // (même tri), sinon DocsAPI n'associe pas la réponse à la ligne demandée.
    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: OfficeService.HISTORY_ORDER,
      select: { id: true, versionNumber: true, fileUrl: true, checksum: true },
    });
    const index = versions.findIndex((v) => v.id === versionId);
    if (index < 0) {
      throw new NotFoundException("Version introuvable pour ce document");
    }
    const version = versions[index];

    const fileName = version.fileUrl.split("/").pop() || "document";
    const extensionMatch = fileName.match(/\.([^.?]+)(\?|$)/);
    const fileType = extensionMatch ? extensionMatch[1].toLowerCase() : "docx";
    const accessToken = this.generateFileAccessToken(version.id, documentId, currentUser.id);

    const data: any = {
      version: index + 1,
      key: this.buildSessionKey(documentId, version),
      url: `${this.internalBackendUrl}/api/v1/office/file?token=${accessToken}`,
      fileType,
    };
    // Docs Server exige un token signé sur setHistoryData quand JWT est activé
    if (this.jwtSecret) {
      data.token = this.jwtService.sign(data, {
        secret: this.jwtSecret,
        expiresIn: "4h",
      });
    }
    return data;
  }

  /**
   * Restauration d'une version antérieure depuis l'éditeur (onRequestRestore).
   * Pas de logique de restauration pré-existante côté documents → on crée une
   * version MINEURE copiant le fichier de la version cible (traçabilité ISO :
   * aucune version n'est écrasée), puis on invalide la session Docs Server.
   */
  async restoreVersion(documentId: string, versionId: string, currentUser: RequestUser) {
    if (!this.enabled) {
      throw new ForbiddenException("OnlyOffice désactivé");
    }
    const { document, currentVersion } = await this.loadDocumentWithCurrentVersion(documentId);

    const target = await this.prisma.documentVersion.findUnique({
      where: { id: versionId },
    });
    if (!target || target.documentId !== documentId) {
      throw new NotFoundException("Version à restaurer introuvable");
    }
    if (target.id === currentVersion.id) {
      throw new BadRequestException("Cette version est déjà la version courante");
    }

    // Mêmes règles de droits que l'édition (buildEditorConfig / handleCallback)
    const roleLevel = ROLE_HIERARCHY[currentUser.role as UserRole] ?? 0;
    const isOwner = document.ownerId === currentUser.id;
    const isReviewer = document.reviewerId === currentUser.id;
    const isAdmin = roleLevel >= ROLE_HIERARCHY[UserRole.ADMIN];
    const isEditableStatus =
      document.status === "DRAFT" ||
      document.status === "IN_REVIEW" ||
      (document.status === "APPROVED" && (isOwner || isAdmin));
    if (!((isOwner || isReviewer || isAdmin) && isEditableStatus)) {
      throw new ForbiddenException(
        "Vous n'avez pas le droit de restaurer une version de ce document",
      );
    }

    // Workflow de validation/signature en cours → refus (mêmes règles que le callback)
    const [pendingValidation, pendingSignature] = await Promise.all([
      this.prisma.validationRequest.findFirst({
        where: { documentId, status: "PENDING" },
        select: { id: true },
      }),
      this.prisma.signatureRequest.findFirst({
        where: { documentVersionId: currentVersion.id, status: "PENDING" },
        select: { id: true },
      }),
    ]);
    if (pendingValidation || pendingSignature) {
      throw new ForbiddenException(
        "Un workflow de validation ou de signature est en cours — restauration impossible",
      );
    }

    // La version cible doit avoir un fichier local restaurable. Certaines
    // DocumentVersion n'en ont pas : snapshots de documents natifs
    // (`fileUrl: "inline://<docId>"`) ou versions dont le fichier a été
    // supprimé par un overwrite brouillon (unlink). On renvoie une erreur
    // métier explicite (400/404) plutôt qu'un 500 disque brut sur une action
    // utilisateur légitime.
    if (!target.fileUrl || !target.fileUrl.startsWith("/storage/")) {
      throw new BadRequestException(
        "Cette version n'a pas de fichier restaurable (document natif ou version sans fichier local).",
      );
    }
    // Copie physique du fichier de la version cible → nouvelle version mineure
    let buffer: Buffer;
    try {
      buffer = await fs.promises.readFile(this.storage.getFilePath(target.fileUrl));
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new NotFoundException("Le fichier de la version à restaurer est introuvable.");
      }
      throw err;
    }
    const oldVersionNumber = currentVersion.versionNumber || "1.0";
    const numMatch = oldVersionNumber.match(/(\d+)(?:\.(\d+))?/);
    const major = numMatch ? parseInt(numMatch[1], 10) : 1;
    const minor = numMatch && numMatch[2] ? parseInt(numMatch[2], 10) : 0;
    const newVersionNumber = `${major}.${minor + 1}`;

    const targetFileName = target.fileUrl.split("/").pop() || "document.docx";
    const extMatch = targetFileName.match(/\.([^.]+)$/);
    const extension = extMatch ? extMatch[1] : "docx";

    const uploaded = await this.storage.upload(
      {
        buffer,
        originalname: `v${newVersionNumber}_restore_${Date.now()}.${extension}`,
        mimetype: target.fileType || this.getMimeTypeFromExtension(extension),
        size: buffer.length,
      } as Express.Multer.File,
      `documents/${documentId}/v${newVersionNumber}`,
    );

    let newVersion;
    try {
      newVersion = await this.prisma.$transaction(async (tx) => {
        const created = await tx.documentVersion.create({
          data: {
            documentId,
            versionNumber: newVersionNumber,
            fileUrl: uploaded.fileUrl,
            fileType: target.fileType,
            fileSizeBytes: buffer.length,
            checksum: target.checksum,
            changeLog: `Restauration de la version ${target.versionNumber} via OnlyOffice`,
            uploadedById: currentUser.id,
          },
        });
        await tx.document.update({
          where: { id: documentId },
          data: { currentVersionId: created.id },
        });
        return created;
      });
    } catch (err) {
      // La transaction a échoué après l'upload : purge le fichier copié pour
      // ne pas laisser d'orphelin sur disque (l'upload précède la $transaction).
      await this.storage.deleteFile(uploaded.fileUrl).catch(() => undefined);
      throw err;
    }

    await this.audit?.log({
      userId: currentUser.id,
      action: "DOCUMENT_VERSION_RESTORED_VIA_OFFICE",
      resourceType: "Document",
      resourceId: documentId,
      metadata: {
        restoredFromVersionId: target.id,
        restoredFromVersionNumber: target.versionNumber,
        previousCurrentVersionId: currentVersion.id,
        previousCurrentVersionNumber: currentVersion.versionNumber,
        newVersionId: newVersion.id,
        newVersionNumber,
        docStatus: document.status,
      },
      severity: "WARN",
    });

    this.logger.log(
      `OnlyOffice restore: doc ${document.reference} v${target.versionNumber} → nouvelle version courante v${newVersionNumber} (user=${currentUser.id})`,
    );

    // Invalide la session Docs Server de l'ancienne version courante :
    // la clé change (nouveau currentVersionId + checksum), on purge le cache.
    void this.dropSession(this.buildSessionKey(documentId, currentVersion)).catch(() => undefined);

    return {
      newVersionId: newVersion.id,
      newVersionNumber,
      restoredFromVersionNumber: target.versionNumber,
    };
  }

  /**
   * Callback appelé par OnlyOffice Docs quand le document est modifié
   * et doit être sauvegardé. OnlyOffice envoie une URL de téléchargement
   * du fichier modifié.
   *
   * status :
   *   0 - no document with key
   *   1 - editing
   *   2 - ready to save
   *   3 - save error
   *   4 - closed with no changes
   *   6 - force save
   *   7 - force save error
   */
  async handleCallback(
    callbackData: any,
    documentVersionId: string,
    userId: string,
  ): Promise<{ error: number }> {
    const status = callbackData?.status;

    // BUG FIX #12 — Log explicitement les erreurs de sauvegarde côté Docs Server.
    // Avant ce patch, statuts 3 / 7 étaient ignorés silencieusement → si Docs
    // Server perdait les modifs d'un utilisateur, on ne le savait jamais.
    if (status === 3) {
      this.logger.warn(
        `OnlyOffice save error (status=3) — doc Docs Server a échoué à sauvegarder. callback=${JSON.stringify(
          callbackData,
        ).slice(0, 500)}`,
      );
      return { error: 0 };
    }
    if (status === 7) {
      this.logger.warn(
        `OnlyOffice force-save error (status=7) — force-save a échoué. callback=${JSON.stringify(
          callbackData,
        ).slice(0, 500)}`,
      );
      return { error: 0 };
    }

    // Statuts 2 et 6 indiquent qu'il faut télécharger le fichier et sauvegarder
    if (status !== 2 && status !== 6) {
      // Autres statuts (0 = unknown key, 1 = editing, 4 = closed no changes) : pas d'action
      return { error: 0 };
    }

    const downloadUrl = callbackData?.url;
    if (!downloadUrl) {
      this.logger.warn("OnlyOffice callback sans URL de téléchargement");
      return { error: 1 };
    }

    // Anti-SSRF : on ne télécharge QUE depuis le Docs Server (URL publique ou
    // interne). Voir isAllowedDownloadUrl().
    if (!this.isAllowedDownloadUrl(downloadUrl)) {
      this.logger.warn(
        `OnlyOffice callback REJETÉ : URL de téléchargement hors liste blanche (${String(downloadUrl).slice(0, 200)})`,
      );
      return { error: 1 };
    }

    // Récupère la version actuelle — on a besoin du documentId pour le verrou
    // et de l'état actuel du document pour la re-vérification des droits (#4)
    // et de l'état workflow (#5).
    const currentVersion = await this.prisma.documentVersion.findUnique({
      where: { id: documentVersionId },
      include: {
        document: {
          include: {
            versions: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!currentVersion) {
      this.logger.warn(`OnlyOffice callback: version introuvable ${documentVersionId}`);
      return { error: 1 };
    }

    const documentId = currentVersion.documentId;

    // BUG FIX #3 — Verrou par documentId : refuse les callbacks concurrents.
    if (this.savingDocuments.has(documentId)) {
      this.logger.warn(
        `OnlyOffice callback: save déjà en cours pour doc ${documentId}, callback ignoré (idempotence)`,
      );
      // On retourne error:0 pour qu'OnlyOffice ne retry pas en boucle —
      // la save en cours va capturer ces modifs (OnlyOffice fait toujours
      // un dernier force-save à la fermeture de la session).
      return { error: 0 };
    }
    this.savingDocuments.add(documentId);

    try {
      // BUG FIX #4 — Re-vérification des droits d'édition au moment du save.
      // Les droits peuvent avoir été révoqués depuis l'ouverture de l'éditeur
      // (e.g. changement de reviewer, passage du doc en OBSOLETE/ARCHIVED).
      const editingUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, deletedAt: true },
      });
      if (!editingUser || editingUser.deletedAt) {
        this.logger.warn(
          `OnlyOffice callback REJETÉ : utilisateur ${userId} introuvable ou supprimé`,
        );
        return { error: 1 };
      }
      const doc = currentVersion.document;
      const roleLevel = ROLE_HIERARCHY[editingUser.role as UserRole] ?? 0;
      const isOwner = doc.ownerId === userId;
      const isReviewer = doc.reviewerId === userId;
      const isAdmin = roleLevel >= ROLE_HIERARCHY[UserRole.ADMIN];
      // Mêmes règles que dans getEditorConfig() : APPROVED éditable par
      // owner/admin (minor version bump), OBSOLETE/ARCHIVED exige réouverture.
      const isEditableStatus =
        doc.status === "DRAFT" ||
        doc.status === "IN_REVIEW" ||
        (doc.status === "APPROVED" && (isOwner || isAdmin));
      const stillCanEdit = (isOwner || isReviewer || isAdmin) && isEditableStatus && !doc.deletedAt;
      if (!stillCanEdit) {
        this.logger.warn(
          `OnlyOffice callback REJETÉ : user=${userId} n'a plus le droit d'éditer doc=${documentId} (status=${doc.status})`,
        );
        await this.audit?.log({
          userId,
          action: "DOCUMENT_VERSION_CREATED_VIA_OFFICE_DENIED",
          resourceType: "Document",
          resourceId: documentId,
          metadata: {
            reason: "permissions_revoked_between_open_and_save",
            documentStatus: doc.status,
          },
          severity: "WARN",
        });
        return { error: 1 };
      }

      // BUG FIX #5 — Blocage si workflow de validation / signature en cours.
      // On ne fork PAS : on refuse le save. Un doc en relecture formelle ne
      // doit pas changer sous les pieds des validateurs. L'auteur doit soit
      // attendre la fin du workflow, soit le rejeter explicitement pour
      // reprendre l'édition.
      const [pendingValidation, pendingSignature] = await Promise.all([
        this.prisma.validationRequest.findFirst({
          where: { documentId, status: "PENDING" },
          select: { id: true },
        }),
        this.prisma.signatureRequest.findFirst({
          where: {
            documentVersionId: currentVersion.id,
            status: "PENDING",
          },
          select: { id: true },
        }),
      ]);
      if (pendingValidation || pendingSignature) {
        this.logger.warn(
          `OnlyOffice callback REJETÉ : doc ${documentId} a un workflow en cours ` +
            `(validation=${!!pendingValidation}, signature=${!!pendingSignature})`,
        );
        await this.audit?.log({
          userId,
          action: "DOCUMENT_VERSION_CREATED_VIA_OFFICE_DENIED",
          resourceType: "Document",
          resourceId: documentId,
          metadata: {
            reason: "workflow_in_progress",
            pendingValidation: !!pendingValidation,
            pendingSignature: !!pendingSignature,
          },
          severity: "WARN",
        });
        return { error: 1 };
      }

      // Télécharge le fichier modifié depuis OnlyOffice Docs.
      // Timeout 60s : éviter de bloquer le callback save indéfiniment si Docs Server est indisponible
      // (sinon Docs Server retentera et on accumule des versions ratées).
      const response = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      // Calcule le nouveau hash
      const newChecksum = crypto.createHash("sha256").update(buffer).digest("hex");

      // Si le hash est identique, pas besoin de créer une nouvelle version.
      // On compare au hash de la version COURANTE officielle du document
      // (document.currentVersionId, fallback createdAt desc — et pas
      // uniquement celle référencée par le token), pour gérer le cas où une
      // autre session aurait déjà poussé une version entretemps.
      let latestVersion = doc.versions[0] || currentVersion;
      if (doc.currentVersionId) {
        const pointed =
          doc.currentVersionId === currentVersion.id
            ? currentVersion
            : await this.prisma.documentVersion.findUnique({
                where: { id: doc.currentVersionId },
              });
        if (pointed && pointed.documentId === documentId) {
          latestVersion = pointed;
        }
      }
      if (newChecksum === latestVersion.checksum) {
        this.logger.debug(`OnlyOffice callback: no changes (same hash) for doc ${documentId}`);
        return { error: 0 };
      }

      // Extraction du nom + extension depuis l'URL de la version courante
      const originalFileName = currentVersion.fileUrl.split("/").pop() || "document.docx";
      const extMatch = originalFileName.match(/\.([^.]+)$/);
      const extension = extMatch ? extMatch[1] : "docx";
      const mimeType = this.getMimeTypeFromExtension(extension);

      // Règle versionning OMNITECH :
      //   - DRAFT : on écrase la version courante (pas de bump, pas de nouvelle
      //     row). L'incrément se fera automatiquement en cas de rejet de revue,
      //     ce qui préserve la version rejetée pour l'audit ISO.
      //   - APPROVED : on crée une nouvelle version mineure (traçabilité des
      //     modifs post-approbation — les acks antérieurs restent preuve de
      //     communication de la version N au temps T).
      const isDraftOverwrite = doc.status === "DRAFT" || doc.status === "IN_REVIEW";

      // Session périmée après restauration / bump concurrent.
      // Le token de callback référence `documentVersionId` = la version ouverte
      // dans cette session (= currentVersion.id). Si le pointeur de version
      // courante du document a bougé depuis l'ouverture (une restauration a
      // créé une nouvelle version et l'a pointée, ou un rejet de revue a cloné
      // la version), un overwrite brouillon écraserait SILENCIEUSEMENT la
      // version désormais pointée (p. ex. la version restaurée) avec le contenu
      // pré-restauration de cette session → la restauration serait annulée sans
      // trace et la piste d'audit ISO mentirait. On refuse le save : l'auteur a
      // délibérément restauré, ses modifs pré-restauration doivent être perdues.
      if (isDraftOverwrite && doc.currentVersionId && doc.currentVersionId !== currentVersion.id) {
        this.logger.warn(
          `OnlyOffice callback REJETÉ : session périmée sur doc ${documentId} ` +
            `(token→ver=${currentVersion.id}, courant→ver=${doc.currentVersionId}) — ` +
            `le pointeur de version a changé depuis l'ouverture (restauration/bump concurrent).`,
        );
        await this.audit?.log({
          userId,
          action: "DOCUMENT_VERSION_CREATED_VIA_OFFICE_DENIED",
          resourceType: "Document",
          resourceId: documentId,
          metadata: {
            reason: "stale_session_after_restore",
            tokenVersionId: currentVersion.id,
            currentVersionId: doc.currentVersionId,
            documentStatus: doc.status,
          },
          severity: "WARN",
        });
        return { error: 1 };
      }

      type VersionRow = {
        id: string;
        documentId: string;
        versionNumber: string;
        fileUrl: string;
        fileType: string;
        fileSizeBytes: number;
        checksum: string;
        changeLog: string | null;
        uploadedById: string;
        createdAt: Date;
      };
      let newVersion: VersionRow;
      let newVersionNumber: string;

      if (isDraftOverwrite) {
        // Overwrite en place : écrit un nouveau fichier (path unique pour éviter
        // tout risque de corruption si l'écriture échoue), met à jour la row
        // existante, et supprime best-effort l'ancien fichier.
        const uploadedFile = await this.storage.upload(
          {
            buffer,
            originalname: `${latestVersion.versionNumber || "v1"}_${Date.now()}.${extension}`,
            mimetype: mimeType,
            size: buffer.length,
          } as Express.Multer.File,
          `documents/${documentId}/${latestVersion.versionNumber || "draft"}`,
        );

        newVersionNumber = latestVersion.versionNumber;
        const oldFileUrl = latestVersion.fileUrl;

        newVersion = await this.prisma.documentVersion.update({
          where: { id: latestVersion.id },
          data: {
            fileUrl: uploadedFile.fileUrl,
            fileType: mimeType,
            fileSizeBytes: buffer.length,
            checksum: newChecksum,
            changeLog: "Brouillon mis à jour via éditeur OnlyOffice",
            uploadedById: userId,
          },
        });

        // Nettoyage best-effort de l'ancien fichier (on a déjà sauvegardé le
        // nouveau et mis à jour la DB : rien à rollback si ça échoue).
        try {
          const oldPath = this.storage.getFilePath(oldFileUrl);
          await fs.promises.unlink(oldPath);
        } catch (err) {
          this.logger.warn(
            `OnlyOffice overwrite: suppression ancien fichier échouée (${oldFileUrl}): ${err instanceof Error ? err.message : err}`,
          );
        }
      } else {
        // APPROVED → bump mineur (traçabilité ISO post-publication)
        const oldVersionNumber = latestVersion.versionNumber || "1.0";
        const numMatch = oldVersionNumber.match(/(\d+)(?:\.(\d+))?/);
        const major = numMatch ? parseInt(numMatch[1], 10) : 1;
        const minor = numMatch && numMatch[2] ? parseInt(numMatch[2], 10) : 0;
        newVersionNumber = `${major}.${minor + 1}`;

        const uploadedFile = await this.storage.upload(
          {
            buffer,
            originalname: `v${newVersionNumber}_${Date.now()}.${extension}`,
            mimetype: mimeType,
            size: buffer.length,
          } as Express.Multer.File,
          `documents/${documentId}/v${newVersionNumber}`,
        );

        // Atomicité Prisma : create + update currentVersionId dans la même tx
        newVersion = await this.prisma.$transaction(async (tx) => {
          const created = await tx.documentVersion.create({
            data: {
              documentId,
              versionNumber: newVersionNumber,
              fileUrl: uploadedFile.fileUrl,
              fileType: mimeType,
              fileSizeBytes: buffer.length,
              checksum: newChecksum,
              changeLog: "Modifié via éditeur OnlyOffice",
              uploadedById: userId,
            },
          });
          await tx.document.update({
            where: { id: documentId },
            data: { currentVersionId: created.id },
          });
          return created;
        });
      }

      this.logger.log(
        `OnlyOffice save: document ${doc.reference} → ${isDraftOverwrite ? "overwrite" : "bump"} v${newVersionNumber} (${buffer.length} bytes)`,
      );

      // Invalidation du cache Docs Server. La clé droppée est TOUJOURS
      // recalculée côté serveur à partir de la version courante (checksum
      // PRÉ-save de `latestVersion` = clé que l'éditeur détenait) et JAMAIS
      // dérivée de `callbackData.key` : ce champ est contrôlable par un porteur
      // de token de callback, qui pourrait sinon faire dropper la clé de
      // session d'un AUTRE document (clés récupérables via getHistory).
      const sessionKey = this.buildSessionKey(documentId, latestVersion);
      // On ne drop qu'à la FIN de session (status 2). Un force-save (status 6)
      // signifie que la session est encore ouverte : invalider son cache
      // n'aurait pas de sens et flirterait avec le comportement « restore old
      // session ». Le bump de version (APPROVED) crée de toute façon une
      // nouvelle clé, l'ancienne s'éteint d'elle-même à la fermeture.
      if (status === 2) {
        void this.dropSession(sessionKey).catch(() => undefined);
      }

      // BUG FIX #6 — Audit trail explicite.
      // Les modifications post-APPROVED sont loguées en WARN (traçabilité
      // conformité : un doc publié qui change doit être visible dans l'audit).
      const isPostApprovalEdit = doc.status === "APPROVED";
      await this.audit?.log({
        userId,
        action: isPostApprovalEdit
          ? "DOCUMENT_VERSION_CREATED_VIA_OFFICE_POST_APPROVAL"
          : "DOCUMENT_VERSION_CREATED_VIA_OFFICE",
        resourceType: "Document",
        resourceId: documentId,
        metadata: {
          oldVersionId: latestVersion.id,
          oldVersionNumber: latestVersion.versionNumber,
          newVersionId: newVersion.id,
          newVersionNumber,
          bytes: buffer.length,
          checksum: newChecksum,
          changeLog: isPostApprovalEdit
            ? `Modifié via OnlyOffice après approbation (version mineure ${newVersionNumber})`
            : "Modifié via éditeur OnlyOffice",
          onlyOfficeStatus: status,
          docStatus: doc.status,
          isPostApprovalEdit,
        },
        severity: isPostApprovalEdit ? "WARN" : "INFO",
      });

      // Si édition post-approval, notifier l'approbateur original (pour info
      // — il peut demander une revue formelle si le changement est substantiel)
      if (isPostApprovalEdit && doc.approverId && doc.approverId !== userId) {
        try {
          await this.prisma.notification.create({
            data: {
              userId: doc.approverId,
              type: "DOC_PUBLISHED",
              title: `Document modifié après approbation : ${doc.title}`,
              body: `${doc.reference} a été mis à jour (v${newVersionNumber}) après avoir été publié. Vérifiez que le changement ne remet pas en cause l'approbation.`,
              resourceType: "Document",
              resourceId: documentId,
            },
          });
        } catch (notifErr) {
          this.logger.warn(
            `OnlyOffice: échec notification approbateur post-approval: ${
              notifErr instanceof Error ? notifErr.message : notifErr
            }`,
          );
        }
      }

      // BUG FIX #7 — Notifier le reviewer (si défini et différent de l'auteur)
      // qu'une nouvelle version est disponible. Best-effort — un échec de
      // notification ne doit pas rollback le save.
      if (doc.reviewerId && doc.reviewerId !== userId) {
        try {
          await this.prisma.notification.create({
            data: {
              userId: doc.reviewerId,
              type: "DOC_REVIEW_NEEDED",
              title: `Nouvelle version: ${doc.title}`,
              body: `${doc.reference} a été mis à jour via l'éditeur (v${newVersionNumber}).`,
              resourceType: "Document",
              resourceId: documentId,
            },
          });
        } catch (notifErr) {
          this.logger.warn(
            `OnlyOffice: échec création notification reviewer: ${
              notifErr instanceof Error ? notifErr.message : notifErr
            }`,
          );
        }
      }

      // BUG FIX #8 — Politique d'invalidation des acknowledgments.
      //
      // DÉCISION MÉTIER : lorsqu'une nouvelle version est créée via l'éditeur
      // OnlyOffice sur un document déjà APPROVED (= publié, ayant reçu des
      // acks de la part des collaborateurs), nous N'INVALIDONS PAS les
      // `DocumentAcknowledgment` existants. Raisons :
      //   1. Les acks sont un snapshot de preuve ISO 27001 A.5.28 : supprimer
      //      ou muter un ack existant détruirait la preuve qu'à l'instant T,
      //      l'utilisateur a bien reçu communication de la version N.
      //   2. Un doc APPROVED qui change substantiellement devrait repasser
      //      par le workflow de validation (#5 bloque déjà l'édition d'un doc
      //      IN_REVIEW) et être re-publié explicitement, ce qui émet de
      //      nouveaux `ACK_REQUIRED`.
      //   3. Pour les petites corrections (typo, formatting), ré-acquitter
      //      toute la base utilisateurs serait disproportionné.
      //
      // En pratique, le code de blocage #5 + le fait qu'un document APPROVED
      // n'est pas dans ['DRAFT','IN_REVIEW'] (#4 canEdit) garantit qu'on
      // n'arrive PAS ici avec un doc APPROVED. Le bloc ci-dessous est donc
      // volontairement un no-op documentaire ; il subsistera comme ancre si
      // la politique `canEdit` change un jour.
      if (doc.status === "APPROVED") {
        this.logger.warn(
          `OnlyOffice save inattendu sur doc APPROVED ${documentId} — ` +
            `aucune invalidation d'ack effectuée (voir commentaire #8).`,
        );
      }

      return { error: 0 };
    } catch (err) {
      this.logger.error(
        `OnlyOffice callback save failed: ${err instanceof Error ? err.message : err}`,
      );
      // BUG FIX #9 — En cas d'erreur (download, upload, DB), on retourne
      // error:1 pour qu'OnlyOffice retry. La version Prisma n'a pas été
      // créée tant que l'upload storage n'a pas abouti, donc rien à rollback.
      await this.audit?.log({
        userId,
        action: "DOCUMENT_VERSION_CREATED_VIA_OFFICE_FAILED",
        resourceType: "Document",
        resourceId: documentId,
        metadata: {
          error: err instanceof Error ? err.message : String(err),
          onlyOfficeStatus: status,
        },
        severity: "CRITICAL",
      });
      return { error: 1 };
    } finally {
      // BUG FIX #3 — libère le verrou quoi qu'il arrive
      this.savingDocuments.delete(documentId);
    }
  }

  /**
   * Retourne le stream d'un fichier (utilisé par OnlyOffice Docs pour télécharger
   * le document via le token signé).
   */
  async getFileStreamForOnlyOffice(documentVersionId: string): Promise<{
    stream: NodeJS.ReadableStream;
    fileName: string;
    contentType: string;
  }> {
    const version = await this.prisma.documentVersion.findUnique({
      where: { id: documentVersionId },
    });
    if (!version) {
      throw new NotFoundException("Version introuvable");
    }
    const stream = this.storage.getFileStream(version.fileUrl);
    const fileName = version.fileUrl.split("/").pop() || "document";
    return {
      stream,
      fileName,
      contentType: version.fileType || "application/octet-stream",
    };
  }

  private getMimeTypeFromExtension(ext: string): string {
    const map: Record<string, string> = {
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xls: "application/vnd.ms-excel",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ppt: "application/vnd.ms-powerpoint",
      odt: "application/vnd.oasis.opendocument.text",
      ods: "application/vnd.oasis.opendocument.spreadsheet",
      odp: "application/vnd.oasis.opendocument.presentation",
      pdf: "application/pdf",
      txt: "text/plain",
      csv: "text/csv",
      rtf: "application/rtf",
    };
    return map[ext.toLowerCase()] || "application/octet-stream";
  }
}
