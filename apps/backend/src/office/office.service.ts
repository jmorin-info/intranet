import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
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
      process.env.JWT_ACCESS_SECRET ||
      process.env.ONLYOFFICE_JWT_SECRET ||
      "insecure-dev-only";

    // L'URL du backend telle que vue depuis OnlyOffice Docs (conteneur → conteneur en Docker).
    // On retire un trailing `/api` éventuel et un slash final pour éviter les URLs doublées
    // type `http://backend:3000/api/api/office/file`.
    const rawInternal =
      process.env.ONLYOFFICE_INTERNAL_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";
    this.internalBackendUrl = rawInternal
      .replace(/\/api\/?$/, "")
      .replace(/\/$/, "");

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
    if (["docx", "doc", "odt", "rtf", "txt", "epub", "fb2"].includes(ext))
      return "word";
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
   * Vérifie un token d'accès fichier OnlyOffice.
   */
  verifyFileAccessToken(
    token: string,
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
      if (payload.purpose !== "onlyoffice-file-access") return null;
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

    const currentVersion = document.versions[0];
    if (!currentVersion) {
      throw new NotFoundException("Aucune version disponible pour ce document");
    }

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
      mode === "edit" &&
      isFormatEditable &&
      (isOwner || isReviewer || isAdmin) &&
      isEditableStatus;

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
        message:
          "Vous n'êtes ni propriétaire, ni relecteur, ni administrateur de ce document.",
        actionHint:
          "Demandez au propriétaire de vous ajouter comme relecteur, ou contactez un administrateur.",
      };
    } else if (document.status === "OBSOLETE") {
      canEditReason = {
        code: "STATUS_OBSOLETE",
        message:
          "Ce document est marqué OBSOLETE, l'édition directe est bloquée.",
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
    const accessToken = this.generateFileAccessToken(
      currentVersion.id,
      document.id,
      currentUser.id,
    );
    const fileUrl = `${this.internalBackendUrl}/api/v1/office/file?token=${accessToken}`;
    const callbackUrl = `${this.internalBackendUrl}/api/v1/office/callback?token=${accessToken}`;

    this.logger.debug(
      `OnlyOffice editor config → doc=${document.reference} ext=${extension} fileUrl=${fileUrl}`,
    );

    // Key stable par fenêtre de 60 secondes → permet la co-édition :
    // deux utilisateurs qui ouvrent le même document dans la même minute
    // partagent la même session OnlyOffice et peuvent éditer ensemble en
    // temps réel. Après 60s d'inactivité, une nouvelle clé est générée,
    // ce qui purge le cache Docs Server et évite les sessions fantômes
    // (typiquement après un redémarrage backend).
    const minuteBucket = Math.floor(Date.now() / 60000);
    const key = `${document.id}-${currentVersion.id}-${minuteBucket}`;

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
        customization: {
          autosave: true,
          forcesave: true,
          toolbarNoTabs: false,
          hideRightMenu: false,
          uiTheme: "theme-classic-light",
          logo: {
            image: `${this.internalBackendUrl.replace("/api", "")}/logo-icon.png`,
            imageDark: `${this.internalBackendUrl.replace("/api", "")}/logo-icon-white.png`,
          },
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
       * `fileUrl` est intentionnellement en clair — le token est à courte durée de vie.
       */
      diagnostic: {
        internalBackendUrl: this.internalBackendUrl,
        fileUrl,
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
      this.logger.warn(
        `OnlyOffice callback: version introuvable ${documentVersionId}`,
      );
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
      const stillCanEdit =
        (isOwner || isReviewer || isAdmin) &&
        isEditableStatus &&
        !doc.deletedAt;
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
      const newChecksum = crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex");

      // Si le hash est identique, pas besoin de créer une nouvelle version.
      // On compare au hash de la version la PLUS RÉCENTE du document (et pas
      // uniquement celle référencée par le token), pour gérer le cas où une
      // autre session aurait déjà poussé une version entretemps.
      const latestVersion = doc.versions[0] || currentVersion;
      if (newChecksum === latestVersion.checksum) {
        this.logger.debug(
          `OnlyOffice callback: no changes (same hash) for doc ${documentId}`,
        );
        return { error: 0 };
      }

      // Extraction du nom + extension depuis l'URL de la version courante
      const originalFileName =
        currentVersion.fileUrl.split("/").pop() || "document.docx";
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
      const isDraftOverwrite =
        doc.status === "DRAFT" || doc.status === "IN_REVIEW";

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
  async getFileStreamForOnlyOffice(
    documentVersionId: string,
  ): Promise<{
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
