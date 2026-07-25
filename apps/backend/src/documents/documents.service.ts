import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";
import { ScannerService } from "../scanner/scanner.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CacheService } from "../common/cache/cache.service";
import { AppMetricsService } from "../health/app-metrics.service";
import { DocumentsRepository } from "./documents.repository";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { DocumentFiltersDto } from "./dto/document-filters.dto";
import { RequestUser } from "../common/interfaces";
import type { UserRole as PrismaUserRole } from "@prisma/client";
import { UserRole, ROLE_HIERARCHY } from "../common/enums";
import { isLegalStatusTransition } from "../common/document-workflow";
import { ISO_CONTROLS_FR } from "../iso-controls/iso-controls-fr.map";
import { sanitizePlainText, sanitizeRichText } from "../common/sanitize";
import { safeParseInt } from "../common/validation-helpers";
import { MeilisearchService, MeiliDocument } from "../search/meilisearch.service";
import { RagService } from "../rag/rag.service";
import { WorkflowRulesService } from "../workflow-rules/workflow-rules.service";

/** Enrich any object that has nested isoControls[].isoControl with titleFr */
function enrichIsoControls<T>(doc: T): T {
  // Generic helper : on travaille sur le type Prisma incluant `isoControls`,
  // mais comme `T` est paramétrique, on garde un cast structurel any-local.
  // TODO: review type safety — typer T extends { isoControls?: ... }.
  const d = doc as any;
  if (d?.isoControls && Array.isArray(d.isoControls)) {
    d.isoControls = d.isoControls.map((link: any) => {
      if (link?.isoControl?.code) {
        return {
          ...link,
          isoControl: {
            ...link.isoControl,
            titleFr: ISO_CONTROLS_FR[link.isoControl.code] || "",
          },
        };
      }
      return link;
    });
  }
  return d;
}

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  // OOXML (Office 2007+)
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  // Legacy Office (pre-2007) — supported by OnlyOffice in view mode
  "application/msword", // .doc
  "application/vnd.ms-excel", // .xls
  "application/vnd.ms-powerpoint", // .ppt
  // ODF (OpenDocument) — editable in OnlyOffice
  "application/vnd.oasis.opendocument.text", // .odt
  "application/vnd.oasis.opendocument.spreadsheet", // .ods
  "application/vnd.oasis.opendocument.presentation", // .odp
  // Images
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  // Markdown + texte brut (documentation légère, procédures)
  "text/markdown",
  "text/x-markdown",
  "text/plain",
];

/**
 * Magic bytes validation — ISO 27001 A.8.28 (secure coding).
 * Prevents MIME type spoofing by verifying file headers.
 * The MIME type declared by the client can be faked; only the first
 * bytes of the file content are trustworthy.
 */
const MAGIC_BYTES: Array<{ mime: string; bytes: number[] }> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  // OOXML (docx, xlsx, pptx) — PK ZIP header (all OOXML are ZIP archives)
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
  // Legacy Office — OLE2 Compound Document (0xD0CF11E0A1B11AE1)
  { mime: "application/msword", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { mime: "application/vnd.ms-excel", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { mime: "application/vnd.ms-powerpoint", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  // ODF (OpenDocument) — also PK ZIP archives
  {
    mime: "application/vnd.oasis.opendocument.text",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
  {
    mime: "application/vnd.oasis.opendocument.spreadsheet",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
  {
    mime: "application/vnd.oasis.opendocument.presentation",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
  // Images
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (WEBP container)
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  // Markdown et texte : pas de magic bytes fiable (format texte UTF-8).
  // Validation effectuée via taille max + MIME declaré ; bypass magic-bytes
  // géré dans validateMagicBytes() par exclusion.
];

// Formats sans magic bytes fiable (texte plat) — accepter tel quel
const TEXT_MIMES_SKIP_MAGIC = new Set(["text/markdown", "text/x-markdown", "text/plain"]);

/**
 * Certains OS / navigateurs n'ont pas de mapping pour .md et envoient
 * `application/octet-stream` ou une chaine vide. On rétro-projette sur le
 * MIME attendu en se basant sur l'extension du nom original.
 */
function normalizeMimeType(file: Express.Multer.File): void {
  const current = (file.mimetype || "").toLowerCase();
  const ambiguous =
    !current || current === "application/octet-stream" || current === "application/x-unknown";
  if (!ambiguous) return;
  const name = (file.originalname || "").toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    file.mimetype = "text/markdown";
  } else if (name.endsWith(".txt")) {
    file.mimetype = "text/plain";
  }
}

function validateMagicBytes(file: Express.Multer.File): boolean {
  // Les formats texte (MD, TXT) n'ont pas de magic bytes fiables : on leur
  // fait confiance sur le MIME type déclaré après contrôle de la taille.
  if (TEXT_MIMES_SKIP_MAGIC.has(file.mimetype)) return true;
  const buffer = file.buffer;
  if (!buffer || buffer.length < 4) return false;
  const entry = MAGIC_BYTES.find((m) => m.mime === file.mimetype);
  if (!entry) return false;
  return entry.bytes.every((b, i) => buffer[i] === b);
}

/**
 * Codes officiels PRO_040 §7.4 utilises pour generer les references
 * documentaires (ex. OMS-PRO-IT-0002). Avant 2026-06-13 on prenait
 * `category.substring(0, 3)` ce qui produisait des codes faux pour
 * RECORD/REPORT (REC/REP au lieu de RAP), STANDARD (STA au lieu de STD),
 * CONTRACT (CON au lieu de CTR), OTHER (OTH au lieu de AUT).
 *
 * Duplique de packages/shared/src/enums.ts (DOCUMENT_CATEGORY_CODE) — le
 * backend ne depend pas de @omnitech/shared (cf. common/enums.ts).
 */
const CATEGORY_CODE_PRO_040: Record<string, string> = {
  POLICY: "POL",
  PROCEDURE: "PRO",
  PLAN: "PLA",
  ORGANIZATION: "ORG",
  INSTRUCTION: "INS",
  STANDARD: "STD",
  GUIDE: "GUI",
  REGISTRY: "REG",
  FORM: "FOR",
  RECORD: "RAP",
  REPORT: "RAP",
  CHARTER: "CHA",
  COMMUNICATION: "COM",
  CONTRACT: "CTR",
  OTHER: "AUT",
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: DocumentsRepository,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly scannerService: ScannerService,
    private readonly notificationsService: NotificationsService,
    private readonly cacheService: CacheService,
    @Optional() private readonly meili?: MeilisearchService,
    @Optional() private readonly rag?: RagService,
    @Optional() private readonly workflowRules?: WorkflowRulesService,
    @Optional() private readonly metrics?: AppMetricsService,
  ) {}

  /** Invalidate document + dashboard stats caches after mutations. */
  private invalidateStatsCaches(): void {
    void this.cacheService.del("stats:documents:global");
    void this.cacheService.del("stats:dashboard:global");
  }

  /**
   * Push a document to Meilisearch (non-blocking).
   */
  private indexForMeili(doc: any): void {
    if (!this.meili) return;
    const payload: MeiliDocument = {
      id: `document-${doc.id}`,
      title: doc.title ?? "",
      content: doc.description ?? "",
      type: "document",
      url: `/documents/${doc.id}`,
      authorId: doc.ownerId ?? null,
      date: doc.createdAt?.toISOString?.() ?? null,
      category: doc.category ?? null,
      classification: doc.classification ?? null,
      status: doc.status ?? null,
      reference: doc.reference ?? null,
      tags: [doc.category, doc.classification, doc.status].filter(Boolean),
    };
    void this.meili
      .indexOne("document", payload)
      .catch((err) =>
        this.logger.warn(
          `Meilisearch indexation failed for document ${doc.id}: ${err?.message || err}`,
        ),
      );
  }

  /**
   * Récupère les département-IDs de l'utilisateur (UserDepartment.userId multi-
   * membership + legacy User.departmentId mono-membership). Utilisé par le
   * résolveur ACL granulaire (DocumentPermission.departmentId).
   */
  private async getUserDepartmentIds(userId: string): Promise<string[]> {
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
    const ids = new Set<string>();
    if (user?.departmentId) ids.add(user.departmentId);
    for (const m of memberships) ids.add(m.departmentId);
    return Array.from(ids);
  }

  /**
   * Vérifie si un utilisateur dispose d'une permission explicite valide
   * (non expirée) sur un document, soit via user direct, soit via
   * département, soit via rôle. Retourne true si au moins une perm match.
   */
  private async hasExplicitPermission(
    userId: string,
    documentId: string,
    role: UserRole,
  ): Promise<boolean> {
    const dptIds = await this.getUserDepartmentIds(userId);
    const now = new Date();
    const perm = await this.prisma.documentPermission.findFirst({
      where: {
        documentId,
        OR: [
          { userId },
          ...(dptIds.length > 0 ? [{ departmentId: { in: dptIds } }] : []),
          { role },
        ],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      select: { id: true },
    });
    return perm !== null;
  }

  /**
   * Classification-based access check (ISO 27001 A.5.12 + A.5.15).
   * Throws ForbiddenException if the user's role is not sufficient
   * for the document's classification level.
   */
  private checkClassificationAccess(
    document: {
      classification?: string | null;
      ownerId: string;
      verifierId?: string | null;
      reviewerId?: string | null;
      approverId?: string | null;
    },
    currentUser: RequestUser,
  ): void {
    const userRole = (currentUser.role || "").toUpperCase() as UserRole;
    const roleLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const classification = (document.classification || "INTERNE").toUpperCase();
    const isOwner = document.ownerId === currentUser.id;

    // ADMIN+ and DIRECTION see everything
    if (roleLevel >= ROLE_HIERARCHY[UserRole.DIRECTION]) return;
    // Owner always has access to their own document
    if (isOwner) return;
    // Un assigné du workflow accède au document qu'il doit traiter,
    // en cohérence avec findById / findAll (contournement tracé A.5.12).
    const isAssigned = [
      document.verifierId,
      document.reviewerId,
      document.approverId,
    ].some((x) => !!x && x === currentUser.id);
    if (isAssigned) {
      if (classification === "SECRET") {
        this.logger.warn(
          `checkClassificationAccess: accès SECRET accordé par assignation user=${currentUser.id} owner=${document.ownerId} (contournement A.5.12)`,
        );
      }
      return;
    }

    if (userRole === UserRole.COLLABORATEUR) {
      // COLLABORATEUR: PUBLIC + INTERNE only
      if (!["PUBLIC", "INTERNE"].includes(classification)) {
        throw new ForbiddenException("Accès refusé");
      }
    } else if (userRole === UserRole.AUDITEUR) {
      // AUDITEUR: up to CONFIDENTIEL
      if (classification === "SECRET") {
        throw new ForbiddenException("Accès refusé");
      }
    } else if (userRole === UserRole.REVIEWER) {
      // REVIEWER: all except SECRET
      if (classification === "SECRET") {
        throw new ForbiddenException("Accès refusé");
      }
    } else if (userRole === UserRole.PRESTATAIRE) {
      // PRESTATAIRE: very restricted, only PUBLIC
      if (classification !== "PUBLIC") {
        throw new ForbiddenException("Accès refusé");
      }
    }
  }

  async findAll(filters: DocumentFiltersDto, currentUser: RequestUser) {
    const page = safeParseInt(filters.page, 1);
    const rawLimit = safeParseInt(filters.limit, 20);
    const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20, 100);
    const where: any = { deletedAt: null, AND: [] };

    // Role-based filtering (ISO 27001 A.5.15 — Access control)
    const userRole = (currentUser.role || "").toUpperCase() as UserRole;
    this.logger.debug(`findAll: user=${currentUser.id} role=${userRole}`);

    // === GED Permissions granulaires (Phase 1 MVP) === 2026-04-26
    // Récupère les département-IDs (multi-membership + legacy) pour matcher
    // les permissions explicites par dpt. Une seule requête, ~10 ms en P95.
    const userDepartmentIds = await this.getUserDepartmentIds(currentUser.id);
    const now = new Date();
    const explicitPermissionMatch = {
      permissions: {
        some: {
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            {
              OR: [
                { userId: currentUser.id },
                ...(userDepartmentIds.length > 0
                  ? [{ departmentId: { in: userDepartmentIds } }]
                  : []),
                { role: userRole },
              ],
            },
          ],
        },
      },
    };

    // Un utilisateur assigné à une étape du workflow (vérificateur, relecteur
    // ou approbateur) DOIT toujours voir le document — quelle que soit sa
    // classification — sinon il ne peut pas agir sur ce qui lui est demandé.
    const assignedToUser = [
      { verifierId: currentUser.id },
      { reviewerId: currentUser.id },
      { approverId: currentUser.id },
    ];

    if (userRole === UserRole.PRESTATAIRE) {
      // Prestataires: CONTRACT documents + public approved docs only
      // + permissions explicites (audit/migration/contrat ad-hoc)
      where.AND.push({
        OR: [
          { category: "CONTRACT", status: "APPROVED" },
          { isPublic: true, status: "APPROVED" },
          ...assignedToUser,
          explicitPermissionMatch,
        ],
      });
    } else if (userRole === UserRole.COLLABORATEUR) {
      // Collaborateurs (ISO 27001 A.5.12):
      //   PUBLIC + INTERNE = visible (approved only)
      //   CONFIDENTIEL + SECRET = invisible (sauf s'ils sont propriétaire,
      //   assigné au workflow, ou bénéficient d'une permission explicite)
      where.AND.push({
        OR: [
          { status: "APPROVED", classification: { in: ["PUBLIC", "INTERNE"] } },
          { ownerId: currentUser.id },
          ...assignedToUser,
          explicitPermissionMatch,
        ],
      });
    } else if (userRole === UserRole.AUDITEUR) {
      // Auditeurs: PUBLIC + INTERNE + CONFIDENTIEL approved (pas SECRET)
      // + docs assignés + permissions explicites
      where.AND.push({
        OR: [
          {
            status: "APPROVED",
            classification: { in: ["PUBLIC", "INTERNE", "CONFIDENTIEL"] },
          },
          ...assignedToUser,
          explicitPermissionMatch,
        ],
      });
    } else if (userRole === UserRole.REVIEWER) {
      // Reviewers: tout sauf SECRET (sauf s'ils sont propriétaire, assigné au
      // workflow, ou bénéficient d'une permission explicite SECRET)
      where.AND.push({
        OR: [
          { classification: { in: ["PUBLIC", "INTERNE", "CONFIDENTIEL"] } },
          { ownerId: currentUser.id },
          ...assignedToUser,
          explicitPermissionMatch,
        ],
      });
    }
    // ADMIN, SUPER_ADMIN, DIRECTION: voient TOUT (y compris SECRET)

    // Apply filters
    if (filters.status) {
      where.AND.push({ status: filters.status });
    }
    if (filters.category) {
      where.AND.push({ category: filters.category });
    }
    if (filters.classification) {
      where.AND.push({ classification: filters.classification });
    }
    if (filters.documentLevel) {
      where.AND.push({ documentLevel: filters.documentLevel });
    }
    if (filters.priority) {
      where.AND.push({ priority: filters.priority });
    }
    if (filters.blocking !== undefined) {
      where.AND.push({ blocking: filters.blocking === "true" });
    }
    if (filters.ownerId) {
      where.AND.push({ ownerId: filters.ownerId });
    }
    if (filters.search) {
      where.AND.push({
        OR: [
          { title: { contains: filters.search, mode: "insensitive" } },
          { description: { contains: filters.search, mode: "insensitive" } },
          { reference: { contains: filters.search, mode: "insensitive" } },
        ],
      });
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }
    if (filters.isoControlCode) {
      where.isoControls = {
        some: {
          isoControl: { code: filters.isoControlCode },
        },
      };
    }

    // Clean up AND array — remove empty entries and ensure it's valid
    if (where.AND && where.AND.length === 0) {
      delete where.AND;
    }

    this.logger.debug(`findAll where: ${JSON.stringify(where).substring(0, 500)}`);

    let data: any[];
    let total: number;
    try {
      const validSortFields = [
        "title",
        "createdAt",
        "updatedAt",
        "reference",
        "status",
        "nextReviewDate",
      ];
      const sortBy = validSortFields.includes(filters.sortBy || "") ? filters.sortBy! : "updatedAt";
      const sortOrder = filters.sortOrder === "asc" ? "asc" : "desc";

      // Repository pattern : l'include partage (owner + isoControls + counts)
      // est encapsule dans DocumentsRepository.findManyWithCount.
      [data, total] = await this.repo.findManyWithCount(
        where,
        { [sortBy]: sortOrder },
        (page - 1) * limit,
        limit,
      );
    } catch (err) {
      this.logger.error(`findAll Prisma error: ${err instanceof Error ? err.message : err}`);
      this.logger.error(`where was: ${JSON.stringify(where)}`);
      throw err;
    }

    return {
      data: data.map(enrichIsoControls),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string, currentUser: RequestUser) {
    // Repository pattern (cf. docs/architecture/REPOSITORY_PATTERN.md) :
    // l'include detail (versions + signatures + ACK + validationRequests)
    // est centralise dans DocumentsRepository.findById. Le service garde
    // la logique RBAC + classification check + ACL granulaire.
    const document = await this.repo.findById(id);

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    // Access checks (ISO 27001 A.5.12 — Classification + A.5.15 — Access Control)
    const userRole = (currentUser.role || "").toUpperCase() as UserRole;
    const isOwner = document.ownerId === currentUser.id;
    const classification = document.classification || "INTERNE";

    // === GED Permissions granulaires (Phase 1 MVP) === 2026-04-26
    // Si l'utilisateur dispose d'une permission explicite valide, on
    // court-circuite les checks de classification (ADMIN+/DIRECTION et
    // owner court-circuitent déjà via les branches existantes).
    const roleLevelForBypass = ROLE_HIERARCHY[userRole] ?? 0;
    if (
      !isOwner &&
      roleLevelForBypass < ROLE_HIERARCHY[UserRole.DIRECTION] &&
      (await this.hasExplicitPermission(currentUser.id, id, userRole))
    ) {
      return enrichIsoControls(document);
    }

    // Un utilisateur assigné à une étape du workflow (vérificateur,
    // relecteur ou approbateur) doit toujours pouvoir lire le document
    // qu'il est censé traiter, quelle que soit sa classification. Sans
    // cela, findAll / getPendingForUser exposent le document dans sa file
    // (« à vous d'agir ») mais findById renvoie un 403 → dead-end, et
    // possibilité d'approbation à l'aveugle. Contournement volontaire et
    // tracé de la matrice de classification (ISO 27001 A.5.12).
    const isAssigned =
      !isOwner &&
      [document.verifierId, document.reviewerId, document.approverId].some(
        (x) => !!x && x === currentUser.id,
      );
    if (isAssigned) {
      if ((classification || "INTERNE").toUpperCase() === "SECRET") {
        this.logger.warn(
          `findById: accès SECRET accordé par assignation user=${currentUser.id} doc=${id} (contournement A.5.12)`,
        );
      }
      return enrichIsoControls(document);
    }

    if (userRole === UserRole.PRESTATAIRE) {
      // Prestataires: only CONTRACT + APPROVED or public + APPROVED
      if (
        !isOwner &&
        (document.status !== "APPROVED" || (document.category !== "CONTRACT" && !document.isPublic))
      ) {
        throw new ForbiddenException("Accès refusé");
      }
    } else if (userRole === UserRole.COLLABORATEUR) {
      // Collaborateurs: PUBLIC + INTERNE approved only, or own documents
      if (!isOwner) {
        if (document.status !== "APPROVED") throw new ForbiddenException("Accès refusé");
        if (!["PUBLIC", "INTERNE"].includes(classification)) {
          throw new ForbiddenException("Niveau de classification insuffisant");
        }
      }
    } else if (userRole === UserRole.AUDITEUR) {
      // Auditeurs: PUBLIC + INTERNE + CONFIDENTIEL approved only (not SECRET)
      if (document.status !== "APPROVED") throw new ForbiddenException("Accès refusé");
      if (classification === "SECRET")
        throw new ForbiddenException("Niveau de classification insuffisant");
    } else if (userRole === UserRole.REVIEWER) {
      // Reviewers: all except SECRET (unless owner)
      if (!isOwner && classification === "SECRET") {
        throw new ForbiddenException("Niveau de classification insuffisant");
      }
    }
    // ADMIN, SUPER_ADMIN, DIRECTION: full access

    return enrichIsoControls(document);
  }

  async findRelated(id: string, limit = 5, currentUser?: RequestUser) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: { isoControls: { select: { isoControlId: true } } },
    });
    if (!doc || doc.deletedAt) throw new NotFoundException("Document introuvable");

    // Classification-based access check before exposing related documents
    if (currentUser) {
      this.checkClassificationAccess(doc, currentUser);
    }

    const isoControlIds = doc.isoControls.map((c) => c.isoControlId);

    // Find docs that share the same category OR the same ISO controls
    const related = await this.prisma.document.findMany({
      where: {
        id: { not: id },
        deletedAt: null,
        status: { not: "ARCHIVED" },
        OR: [
          { category: doc.category },
          ...(isoControlIds.length > 0
            ? [
                {
                  isoControls: {
                    some: { isoControlId: { in: isoControlIds } },
                  },
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        title: true,
        reference: true,
        category: true,
        status: true,
        updatedAt: true,
        isoControls: {
          include: {
            isoControl: { select: { code: true, titleFr: true, title: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return related;
  }

  async create(dto: CreateDocumentDto, userId: string) {
    const reference = await this.generateReference(dto.category, dto.domain || "GEN");

    const document = await this.prisma.document.create({
      data: {
        title: sanitizePlainText(dto.title),
        description: dto.description ? sanitizePlainText(dto.description) : undefined,
        category: dto.category,
        reference,
        ownerId: userId,
        verifierId: dto.verifierId,
        reviewerId: dto.reviewerId,
        approverId: dto.approverId,
        nextReviewDate: dto.nextReviewDate ? new Date(dto.nextReviewDate) : null,
        isPublic: dto.isPublic ?? false,
        classification: dto.classification || "INTERNE",
        // Champs REG_016 (désormais acceptés par le DTO)
        parentReference: dto.parentReference || null,
        documentLevel: dto.documentLevel ?? null,
        priority: dto.priority ?? null,
        blocking: dto.blocking ?? false,
        reviewPeriodicity: dto.reviewPeriodicity || null,
        isoControls: dto.isoControlIds?.length
          ? {
              create: dto.isoControlIds.map((isoControlId) => ({
                isoControlId,
              })),
            }
          : undefined,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        isoControls: { include: { isoControl: true } },
      },
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_CREATED",
      resourceType: "Document",
      resourceId: document.id,
      metadata: { title: dto.title, category: dto.category, reference },
    });

    this.logger.log(`Document created: ${reference} by user ${userId}`);
    this.indexForMeili(document);
    this.invalidateStatsCaches();

    // ---- Approbation N+1 dynamique : règles WorkflowRule -------------------
    // On cherche une règle applicable au contexte du document. Si match, on
    // instancie le workflow correspondant à la place du fallback `reviewerId`.
    // Toute erreur ici est non bloquante — on log et on retombe sur le
    // comportement historique pour ne pas casser la création de doc.
    if (this.workflowRules) {
      try {
        const author = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { departmentId: true },
        });
        const rule = await this.workflowRules.findApplicableRule({
          classification: document.classification ?? null,
          category: document.category ?? null,
          departmentId: author?.departmentId ?? null,
        });
        if (rule) {
          await this.workflowRules.instantiateWorkflow(
            { id: rule.id, name: rule.name, steps: rule.steps },
            { id: document.id, currentVersionId: null },
            userId,
          );
        }
      } catch (err) {
        // Non bloquant : le moteur générique (approval-workflows) est un
        // chantier séparé et échoue encore à la création (aucune version
        // n'existe → currentVersionId:null). Le document reste valide et suit
        // le workflow ValidationRequest classique (reviewer/approver). On trace
        // clairement pour ne pas masquer un futur branchement du moteur.
        this.logger.warn(
          `[workflow-rules] instantiateWorkflow ignoré pour document ${document.id} ` +
            `(${reference}) — fallback sur le workflow ValidationRequest. Cause : ` +
            `${(err as Error).message}`,
        );
      }
    }

    return enrichIsoControls(document);
  }

  /**
   * Create a document whose content is authored directly in the intranet
   * (no file upload). Stores HTML in Document.content and flags isNative = true.
   * ISO 27001 A.5.1 — full traceability of policy drafting inside the GED.
   */
  /**
   * Create + publish a document in one shot (status = APPROVED, no workflow).
   * Used for permanent / info-only docs where the 4-eyes review is irrelevant.
   * Audit trail : logs DOCUMENT_DIRECT_PUBLISHED with WARN severity so admins
   * can track bypasses.
   */
  async directPublish(dto: CreateDocumentDto, user: RequestUser) {
    // Delegate to normal create first so references, slugs, audit trail,
    // search indexing etc. are identical.
    const doc = await this.create(dto, user.id);

    const published = await this.prisma.document.update({
      where: { id: doc.id },
      data: { status: "APPROVED" },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        isoControls: { include: { isoControl: true } },
      },
    });

    await this.auditService.log({
      userId: user.id,
      action: "DOCUMENT_DIRECT_PUBLISHED",
      resourceType: "Document",
      resourceId: doc.id,
      severity: "WARN",
      metadata: {
        title: doc.title,
        reference: (doc as { reference?: string }).reference,
        reason: "Permanent document — workflow bypassed by admin",
      },
    });

    this.logger.warn(
      `Direct publish : document ${doc.id} ('${doc.title}') published by ${user.id} — workflow bypassed`,
    );
    try {
      this.metrics?.documentsApprovedTotal.inc();
    } catch {
      /* noop */
    }
    return published;
  }

  /**
   * Force-approve an existing document : set status = APPROVED, cancel any
   * pending workflow instance, and optionally clear nextReviewDate to mark
   * the document as permanent. ADMIN+ only.
   *
   * Refs: feedback user 2026-04-21 "impossible de mettre document en permanent
   * + approuvé sans revue si déjà existant".
   */
  async forceApprove(id: string, user: RequestUser, makePermanent: boolean) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    // Role check (double-guard ; le controller a déjà @Roles(ADMIN+))
    if (ROLE_HIERARCHY[user.role as UserRole] < ROLE_HIERARCHY[UserRole.ADMIN]) {
      throw new ForbiddenException(
        "Seul un administrateur peut forcer l'approbation d'un document.",
      );
    }

    // Annule les workflows pending (même logique que softDelete)
    const pendingInstances = await this.prisma.approvalInstance.findMany({
      where: { documentId: id, status: "PENDING" },
      select: { id: true },
    });
    if (pendingInstances.length > 0) {
      const instanceIds = pendingInstances.map((i) => i.id);
      await this.prisma.$transaction([
        this.prisma.approvalInstance.updateMany({
          where: { id: { in: instanceIds } },
          data: { status: "CANCELLED", completedAt: new Date() },
        }),
        this.prisma.approvalStepInstance.updateMany({
          where: { instanceId: { in: instanceIds }, decision: "PENDING" },
          data: {
            decision: "REJECTED",
            decidedAt: new Date(),
            comment: "Approbation forcée par un administrateur",
          },
        }),
      ]);
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        status: "APPROVED",
        ...(makePermanent ? { nextReviewDate: null } : {}),
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reviewer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        isoControls: { include: { isoControl: true } },
      },
    });

    await this.auditService.log({
      userId: user.id,
      action: "DOCUMENT_FORCE_APPROVED",
      resourceType: "Document",
      resourceId: id,
      severity: "WARN",
      metadata: {
        title: doc.title,
        reference: doc.reference,
        fromStatus: doc.status,
        makePermanent,
        cancelledWorkflows: pendingInstances.length,
      },
    });

    this.logger.warn(
      `forceApprove doc ${id} by ${user.id} (${doc.status} → APPROVED, permanent=${makePermanent}, ${pendingInstances.length} workflow(s) annulé(s))`,
    );

    try {
      this.metrics?.documentsApprovedTotal.inc();
    } catch {
      /* noop */
    }
    this.invalidateStatsCaches();
    return updated;
  }

  /**
   * Réouvre un document ARCHIVED ou OBSOLETE en remettant status à DRAFT.
   * Cas d'usage : produire une nouvelle version d'un document périmé sans
   * en créer un nouveau (préserve l'historique de versions et la référence).
   *
   * Accès : propriétaire du document OU ADMIN+. Annule les workflows pending
   * (si quelqu'un avait tenté de réactiver le doc différemment en //). L'étape
   * suivante côté utilisateur est d'uploader une nouvelle version via
   * POST /documents/:id/versions, puis de relancer le workflow de revue.
   */
  async reopenDocument(id: string, user: RequestUser) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    const isAdmin = ROLE_HIERARCHY[user.role as UserRole] >= ROLE_HIERARCHY[UserRole.ADMIN];
    const isOwner = doc.ownerId === user.id;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        "Seuls le propriétaire du document ou un administrateur peut le réouvrir.",
      );
    }

    if (doc.status !== "ARCHIVED" && doc.status !== "OBSOLETE") {
      throw new BadRequestException(
        `Impossible de réouvrir un document en statut "${doc.status}". Seuls les documents archivés ou obsolètes peuvent être réouverts.`,
      );
    }

    // Annule d'éventuels workflows pending (rare, mais sécuritaire)
    const pendingInstances = await this.prisma.approvalInstance.findMany({
      where: { documentId: id, status: "PENDING" },
      select: { id: true },
    });
    if (pendingInstances.length > 0) {
      const instanceIds = pendingInstances.map((i) => i.id);
      await this.prisma.$transaction([
        this.prisma.approvalInstance.updateMany({
          where: { id: { in: instanceIds } },
          data: { status: "CANCELLED", completedAt: new Date() },
        }),
        this.prisma.approvalStepInstance.updateMany({
          where: { instanceId: { in: instanceIds }, decision: "PENDING" },
          data: {
            decision: "REJECTED",
            decidedAt: new Date(),
            comment: "Document réouvert — workflow annulé",
          },
        }),
      ]);
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: { status: "DRAFT" },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reviewer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        isoControls: { include: { isoControl: true } },
      },
    });

    await this.auditService.log({
      userId: user.id,
      action: "DOCUMENT_REOPENED",
      resourceType: "Document",
      resourceId: id,
      severity: "INFO",
      metadata: {
        title: doc.title,
        reference: doc.reference,
        fromStatus: doc.status,
        cancelledWorkflows: pendingInstances.length,
      },
    });

    this.logger.log(
      `reopen doc ${id} by ${user.id} (${doc.status} → DRAFT, ${pendingInstances.length} workflow(s) annulé(s))`,
    );

    this.invalidateStatsCaches();
    return updated;
  }

  async createInline(dto: CreateDocumentDto, userId: string) {
    const reference = await this.generateReference(dto.category, dto.domain || "GEN");

    const document = await this.prisma.document.create({
      data: {
        title: sanitizePlainText(dto.title),
        description: dto.description ? sanitizePlainText(dto.description) : undefined,
        category: dto.category,
        reference,
        ownerId: userId,
        verifierId: dto.verifierId,
        reviewerId: dto.reviewerId,
        approverId: dto.approverId,
        nextReviewDate: dto.nextReviewDate ? new Date(dto.nextReviewDate) : null,
        isPublic: dto.isPublic ?? false,
        classification: dto.classification || "INTERNE",
        // Champs REG_016 — persistés comme dans create() (sinon silencieusement
        // perdus alors que CreateDocumentDto les valide).
        parentReference: dto.parentReference || null,
        documentLevel: dto.documentLevel ?? null,
        priority: dto.priority ?? null,
        blocking: dto.blocking ?? false,
        reviewPeriodicity: dto.reviewPeriodicity || null,
        // XSS stockée : le HTML riche des documents natifs doit être assaini
        // avant stockage (même pattern que wiki/news/content). Sinon il est
        // servi tel quel via l'éditeur inline ET le lien de partage public.
        content: sanitizeRichText(dto.content ?? ""),
        isNative: true,
        scanStatus: "CLEAN", // inline content bypasses AV
        isoControls: dto.isoControlIds?.length
          ? {
              create: dto.isoControlIds.map((isoControlId) => ({
                isoControlId,
              })),
            }
          : undefined,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        isoControls: { include: { isoControl: true } },
      },
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_CREATED_INLINE",
      resourceType: "Document",
      resourceId: document.id,
      metadata: {
        title: dto.title,
        category: dto.category,
        reference,
        isNative: true,
      },
    });

    this.logger.log(`Inline document created: ${reference} by user ${userId}`);
    this.invalidateStatsCaches();
    return enrichIsoControls(document);
  }

  /**
   * Update the HTML content of a native (inline) document.
   * Lock rules:
   *  - document must be native (isNative = true)
   *  - only the owner OR an assigned reviewer OR ADMIN+ may edit
   *  - status must be DRAFT or IN_REVIEW (once approved, content is frozen)
   */
  async updateInlineContent(id: string, content: string, currentUser: RequestUser) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    if (!document.isNative) {
      throw new BadRequestException("Ce document n'est pas éditable en ligne (document uploadé)");
    }

    const userRole = (currentUser.role || "").toUpperCase() as UserRole;
    const isAdmin = ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[UserRole.ADMIN];
    const isOwner = document.ownerId === currentUser.id;
    const isAssignedReviewer = document.reviewerId === currentUser.id;

    if (!isAdmin && !isOwner && !isAssignedReviewer) {
      throw new ForbiddenException(
        "Seul le propriétaire, le relecteur assigné ou un administrateur peut éditer ce document",
      );
    }

    if (document.status !== "DRAFT" && document.status !== "IN_REVIEW") {
      throw new ForbiddenException("Le contenu ne peut être édité qu'en statut DRAFT ou IN_REVIEW");
    }

    const updated = await this.prisma.document.update({
      where: { id },
      // XSS stockée : assainir le HTML avant persistance (cf. createInline).
      data: { content: sanitizeRichText(content) },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        isoControls: { include: { isoControl: true } },
      },
    });

    await this.auditService.log({
      userId: currentUser.id,
      action: "DOCUMENT_CONTENT_UPDATED",
      resourceType: "Document",
      resourceId: id,
      metadata: { length: content.length },
    });

    return enrichIsoControls(updated);
  }

  async update(id: string, dto: UpdateDocumentDto, currentUser: RequestUser) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        // Étape PENDING courante du workflow actif : sert à (1) annuler la
        // ValidationRequest si le statut change hors workflow, (2) réassigner
        // la step si le vérificateur/relecteur/approbateur change en cours.
        validationRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            steps: {
              where: { action: null },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    const userRole = (currentUser.role || "").toUpperCase() as UserRole;
    const isOwner = document.ownerId === currentUser.id;
    const isAdmin = ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[UserRole.ADMIN];

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        "Seul le propriétaire ou un administrateur peut modifier ce document",
      );
    }

    // Garde de transition : un PATCH manuel de `status` ne peut suivre que la
    // matrice du cycle de vie (ISO 27001 A.5.1) et exige le rôle adéquat. Les
    // transitions du workflow nominal passent par les endpoints dédiés
    // (submit-review, approve, …), jamais par ici.
    const statusChanges = dto.status !== undefined && dto.status !== document.status;
    if (statusChanges) {
      if (!isLegalStatusTransition(document.status, dto.status!, userRole)) {
        throw new BadRequestException(
          `Transition de statut illégale : « ${document.status} » → « ${dto.status} » ` +
            `(rôle ${userRole}). Utilisez le workflow de validation pour faire ` +
            `avancer ce document.`,
        );
      }
    }

    const updateData: any = {};
    // sanitizePlainText sur title/description pour cohérence avec create()
    // (P1 — évite une XSS stockée si ces champs sont un jour rendus en HTML).
    if (dto.title !== undefined) updateData.title = sanitizePlainText(dto.title);
    if (dto.description !== undefined)
      updateData.description = dto.description
        ? sanitizePlainText(dto.description)
        : dto.description;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.verifierId !== undefined) updateData.verifierId = dto.verifierId;
    if (dto.reviewerId !== undefined) updateData.reviewerId = dto.reviewerId;
    if (dto.approverId !== undefined) updateData.approverId = dto.approverId;
    if (dto.nextReviewDate !== undefined)
      updateData.nextReviewDate = dto.nextReviewDate ? new Date(dto.nextReviewDate) : null;
    if (dto.isPublic !== undefined) updateData.isPublic = dto.isPublic;
    if (dto.classification !== undefined) updateData.classification = dto.classification;
    if (dto.status !== undefined) updateData.status = dto.status;
    // Champs REG_016 (désormais acceptés par UpdateDocumentDto)
    if (dto.parentReference !== undefined) updateData.parentReference = dto.parentReference || null;
    if (dto.documentLevel !== undefined) updateData.documentLevel = dto.documentLevel;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.blocking !== undefined) updateData.blocking = dto.blocking;
    if (dto.reviewPeriodicity !== undefined)
      updateData.reviewPeriodicity = dto.reviewPeriodicity || null;

    // Handle ISO controls update — wrapped in a transaction to avoid
    // leaving the document with no ISO controls if the createMany fails.
    if (dto.isoControlIds !== undefined) {
      const newIsoControlIds = dto.isoControlIds;
      await this.prisma.$transaction(async (tx) => {
        await tx.documentIsoControl.deleteMany({
          where: { documentId: id },
        });
        if (newIsoControlIds.length > 0) {
          await tx.documentIsoControl.createMany({
            data: newIsoControlIds.map((isoControlId) => ({
              documentId: id,
              isoControlId,
            })),
          });
        }
      });
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        isoControls: { include: { isoControl: true } },
      },
    });

    // Notify document owner when status changes (e.g. Kanban drag-and-drop)
    if (statusChanges) {
      const statusLabels: Record<string, string> = {
        DRAFT: "Brouillon",
        IN_REVIEW: "En revue",
        REVIEW_APPROVED: "Revue validée",
        PENDING_APPROVAL: "En attente d'approbation",
        APPROVED: "Approuvé",
        OBSOLETE: "Obsolète",
        ARCHIVED: "Archivé",
      };
      const newStatusLabel = statusLabels[dto.status!] || dto.status;
      const oldStatusLabel = statusLabels[document.status] || document.status;

      // Notify the owner if the change was made by someone else
      if (document.ownerId !== currentUser.id) {
        await this.notificationsService.create({
          userId: document.ownerId,
          type: "DOC_PUBLISHED",
          title: `Statut modifié : ${document.title}`,
          body: `Le statut du document "${document.title}" (${document.reference}) a été changé de "${oldStatusLabel}" à "${newStatusLabel}".`,
          resourceType: "Document",
          resourceId: id,
        });
      }
    }

    // --- Cohérence workflow : réassignation & annulation des étapes en cours --
    const pendingRequest = document.validationRequests?.[0];
    if (pendingRequest) {
      if (statusChanges) {
        // Changement de statut hors workflow → la ValidationRequest pendante
        // devient orpheline : on l'annule proprement (CANCELLED + audit) pour
        // ne pas laisser d'étape « à faire » fantôme (cause des docs incohérents).
        await this.prisma.validationRequest.update({
          where: { id: pendingRequest.id },
          data: { status: "CANCELLED" },
        });
        await this.auditService.log({
          userId: currentUser.id,
          action: "DOCUMENT_VALIDATION_CANCELLED",
          resourceType: "Document",
          resourceId: id,
          severity: "WARN",
          metadata: {
            reason: "status_changed_out_of_workflow",
            from: document.status,
            to: dto.status,
            requestId: pendingRequest.id,
          },
        });
      } else {
        // Statut inchangé mais l'assigné de l'étape courante a changé →
        // réassigner la ValidationStep PENDING, notifier le nouvel assigné,
        // tracer. Sinon l'ancien assigné garde une action fantôme et le nouveau
        // ne voit rien dans sa file « à traiter ».
        const stepTypeByRole: Record<string, "VERIFICATION" | "REVIEW" | "APPROVAL"> = {
          verifierId: "VERIFICATION",
          reviewerId: "REVIEW",
          approverId: "APPROVAL",
        };
        const roleChanges: Array<{
          field: "verifierId" | "reviewerId" | "approverId";
          newId: string;
          label: string;
          notifType: "DOC_REVIEW_NEEDED" | "DOC_APPROVAL_NEEDED";
        }> = [];
        if (
          dto.verifierId !== undefined &&
          dto.verifierId !== null &&
          dto.verifierId !== document.verifierId
        )
          roleChanges.push({
            field: "verifierId",
            newId: dto.verifierId,
            label: "vérification",
            notifType: "DOC_REVIEW_NEEDED",
          });
        if (
          dto.reviewerId !== undefined &&
          dto.reviewerId !== null &&
          dto.reviewerId !== document.reviewerId
        )
          roleChanges.push({
            field: "reviewerId",
            newId: dto.reviewerId,
            label: "revue technique",
            notifType: "DOC_REVIEW_NEEDED",
          });
        if (
          dto.approverId !== undefined &&
          dto.approverId !== null &&
          dto.approverId !== document.approverId
        )
          roleChanges.push({
            field: "approverId",
            newId: dto.approverId,
            label: "approbation",
            notifType: "DOC_APPROVAL_NEEDED",
          });

        for (const change of roleChanges) {
          const wantedStepType = stepTypeByRole[change.field];
          // On ne réassigne QUE l'étape effectivement en cours (currentStep).
          if (pendingRequest.currentStep !== wantedStepType) continue;
          const pendingStep = pendingRequest.steps.find((s) => s.stepType === wantedStepType);
          if (!pendingStep) continue;

          await this.prisma.validationStep.update({
            where: { id: pendingStep.id },
            data: { assignedToId: change.newId },
          });
          await this.notificationsService.create({
            userId: change.newId,
            type: change.notifType,
            title: `Étape ${change.label} qui vous est réassignée`,
            body: `Le document "${document.title}" (${document.reference}) vous a été réassigné pour l'étape de ${change.label}.`,
            resourceType: "Document",
            resourceId: id,
          });
          await this.auditService.log({
            userId: currentUser.id,
            action: "DOCUMENT_VALIDATION_REASSIGNED",
            resourceType: "Document",
            resourceId: id,
            severity: "INFO",
            metadata: {
              stepType: wantedStepType,
              stepId: pendingStep.id,
              from: pendingStep.assignedToId,
              to: change.newId,
            },
          });
        }
      }
    }

    await this.auditService.log({
      userId: currentUser.id,
      action: "DOCUMENT_UPDATED",
      resourceType: "Document",
      resourceId: id,
      metadata: { changes: dto },
    });

    this.indexForMeili(updated);
    this.invalidateStatsCaches();
    return enrichIsoControls(updated);
  }

  async softDelete(id: string, currentUser: RequestUser) {
    const document = await this.prisma.document.findUnique({ where: { id } });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Annule tous les workflows d'approbation pending pour ce document.
    // Sinon les step-instances pending restent dans /approval-workflows/pending/me,
    // le status-bar propose un lien '#workflow', et l'utilisateur tombe
    // sur 404 Document introuvable (bug 2026-04-21).
    try {
      const pendingInstances = await this.prisma.approvalInstance.findMany({
        where: { documentId: id, status: "PENDING" },
        select: { id: true },
      });
      if (pendingInstances.length > 0) {
        const instanceIds = pendingInstances.map((i) => i.id);
        await this.prisma.$transaction([
          this.prisma.approvalInstance.updateMany({
            where: { id: { in: instanceIds } },
            data: { status: "CANCELLED", completedAt: new Date() },
          }),
          this.prisma.approvalStepInstance.updateMany({
            where: { instanceId: { in: instanceIds }, decision: "PENDING" },
            data: {
              decision: "REJECTED",
              decidedAt: new Date(),
              comment: "Document supprimé",
            },
          }),
        ]);
        this.logger.log(
          `softDelete doc ${id} : ${pendingInstances.length} workflow(s) pending annulé(s)`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `softDelete doc ${id} : échec annulation workflows pending — ${(err as Error).message}`,
      );
    }

    // Désindexation complète : Meilisearch (recherche globale) + RAG
    // (chatbot ne doit plus ressortir le contenu).
    void this.meili?.deleteDocument("document", id);
    void this.rag?.removeFromIndex("DOCUMENT" as never, id).catch(() => undefined);

    await this.auditService.log({
      userId: currentUser.id,
      action: "DOCUMENT_DELETED",
      resourceType: "Document",
      resourceId: id,
      severity: "WARN",
      metadata: { title: document.title, reference: document.reference },
    });

    this.invalidateStatsCaches();
    return { message: "Document supprimé avec succès" };
  }

  /**
   * Bulk soft-delete. Caps at 100 ids (DTO also enforces this).
   * ISO 27001 A.5.10 / A.8.3 — controlled deletion with audit trail.
   */
  async bulkSoftDelete(ids: string[], currentUser: RequestUser) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException("Aucun identifiant fourni");
    }
    if (ids.length > 100) {
      throw new BadRequestException("Trop d'identifiants (max 100)");
    }

    // Only target documents that still exist and aren't already deleted.
    const existing = await this.prisma.document.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, title: true, reference: true },
    });

    if (existing.length === 0) {
      return { deleted: 0 };
    }

    const existingIds = existing.map((d) => d.id);
    const result = await this.prisma.document.updateMany({
      where: { id: { in: existingIds } },
      data: { deletedAt: new Date() },
    });

    // Fire audit entries sequentially (logging failures are swallowed by AuditService)
    for (const doc of existing) {
      await this.auditService.log({
        userId: currentUser.id,
        action: "DOCUMENT_DELETED",
        resourceType: "Document",
        resourceId: doc.id,
        severity: "WARN",
        metadata: {
          title: doc.title,
          reference: doc.reference,
          bulk: true,
          batchSize: existing.length,
        },
      });
    }

    this.logger.log(`Bulk soft-delete: ${result.count} documents by user ${currentUser.id}`);

    return { deleted: result.count };
  }

  /**
   * Bulk archive (status = ARCHIVED). ADMIN/SUPER_ADMIN only.
   * ISO 27001 A.5.10 — controlled bulk modification with audit trail.
   */
  async bulkArchive(ids: string[], currentUser: RequestUser) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException("Aucun identifiant fourni");
    }
    if (ids.length > 100) {
      throw new BadRequestException("Trop d'identifiants (max 100)");
    }

    const existing = await this.prisma.document.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, title: true, reference: true, status: true },
    });

    if (existing.length === 0) return { updated: 0 };

    const existingIds = existing.map((d) => d.id);
    const result = await this.prisma.document.updateMany({
      where: { id: { in: existingIds } },
      data: { status: "ARCHIVED" },
    });

    for (const doc of existing) {
      await this.auditService.log({
        userId: currentUser.id,
        action: "DOCUMENT_ARCHIVED",
        resourceType: "Document",
        resourceId: doc.id,
        severity: "INFO",
        metadata: {
          title: doc.title,
          reference: doc.reference,
          previousStatus: doc.status,
          bulk: true,
          batchSize: existing.length,
        },
      });
    }

    this.logger.log(`Bulk archive: ${result.count} documents by user ${currentUser.id}`);

    return { updated: result.count };
  }

  /**
   * Bulk reclassify. ADMIN/SUPER_ADMIN only.
   * ISO 27001 A.5.12 — information classification change with audit trail.
   */
  async bulkClassify(ids: string[], classification: string, currentUser: RequestUser) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException("Aucun identifiant fourni");
    }
    if (ids.length > 100) {
      throw new BadRequestException("Trop d'identifiants (max 100)");
    }
    const ALLOWED = ["PUBLIC", "INTERNE", "CONFIDENTIEL", "SECRET"];
    if (!ALLOWED.includes(classification)) {
      throw new BadRequestException(`Classification invalide: ${classification}`);
    }

    const existing = await this.prisma.document.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, title: true, reference: true, classification: true },
    });

    if (existing.length === 0) return { updated: 0 };

    const existingIds = existing.map((d) => d.id);
    const result = await this.prisma.document.updateMany({
      where: { id: { in: existingIds } },
      data: { classification },
    });

    for (const doc of existing) {
      await this.auditService.log({
        userId: currentUser.id,
        action: "DOCUMENT_CLASSIFICATION_CHANGED",
        resourceType: "Document",
        resourceId: doc.id,
        severity: "WARN",
        metadata: {
          title: doc.title,
          reference: doc.reference,
          from: doc.classification,
          to: classification,
          bulk: true,
          batchSize: existing.length,
        },
      });
    }

    this.logger.log(
      `Bulk classify (${classification}): ${result.count} documents by user ${currentUser.id}`,
    );

    return { updated: result.count };
  }

  async uploadVersion(
    documentId: string,
    file: Express.Multer.File,
    changeLog: string | undefined,
    userId: string,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    // Normalise le MIME : certains OS envoient application/octet-stream pour
    // les .md / .txt — on rétro-projette à partir de l'extension avant validation.
    normalizeMimeType(file);
    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Type de fichier non autorisé: ${file.mimetype}`);
    }

    // Validate magic bytes — ISO 27001 A.8.28 (prevents MIME spoofing)
    if (file.buffer && !validateMagicBytes(file)) {
      throw new BadRequestException(
        "Le contenu du fichier ne correspond pas au type déclaré (magic bytes invalides)",
      );
    }

    // Compute checksum
    const checksum = await this.storageService.generateChecksum(file);

    // Check for duplicate version by checksum
    const existingVersion = await this.prisma.documentVersion.findFirst({
      where: { documentId, checksum },
    });
    if (existingVersion) {
      throw new BadRequestException(
        "Ce fichier est identique à une version existante (même checksum)",
      );
    }

    // Upload file
    const { fileUrl } = await this.storageService.upload(file, `documents/${documentId}`);

    // Règle versionning OMNITECH :
    //   - Pas de version précédente : crée v1.0
    //   - Brouillon (DRAFT) ET version existante : overwrite la version
    //     courante (pas de bump — l'incrément se fera au rejet de revue pour
    //     préserver la version rejetée)
    //   - Toute autre transition (APPROVED, etc.) : bump majeur (1.0 → 2.0)
    const lastVersion = document.versions[0];
    const isDraftOverwrite =
      !!lastVersion && (document.status === "DRAFT" || document.status === "IN_REVIEW");

    let version;
    let nextVersionNumber: string;

    if (isDraftOverwrite) {
      // Overwrite en place : update la row existante, supprime l'ancien
      // fichier best-effort, garde le même versionNumber.
      nextVersionNumber = lastVersion.versionNumber;
      const oldFileUrl = lastVersion.fileUrl;

      version = await this.prisma.documentVersion.update({
        where: { id: lastVersion.id },
        data: {
          fileUrl,
          fileType: file.mimetype,
          fileSizeBytes: file.size,
          checksum,
          changeLog: changeLog || "Brouillon mis à jour",
          uploadedById: userId,
        },
      });

      try {
        const oldPath = this.storageService.getFilePath(oldFileUrl);
        if (require("fs").existsSync(oldPath)) {
          require("fs").unlinkSync(oldPath);
        }
      } catch (err) {
        this.logger.warn(
          `uploadVersion overwrite: suppression ancien fichier échouée (${oldFileUrl}): ${err}`,
        );
      }
    } else {
      nextVersionNumber = lastVersion
        ? `${parseInt(lastVersion.versionNumber.split(".")[0] ?? "1", 10) + 1}.0`
        : "1.0";

      version = await this.prisma.documentVersion.create({
        data: {
          documentId,
          versionNumber: nextVersionNumber,
          fileUrl,
          fileType: file.mimetype,
          fileSizeBytes: file.size,
          checksum,
          changeLog,
          uploadedById: userId,
        },
      });

      await this.prisma.document.update({
        where: { id: documentId },
        data: { currentVersionId: version.id },
      });
    }

    await this.auditService.log({
      userId,
      action: "DOCUMENT_VERSION_UPLOADED",
      resourceType: "DocumentVersion",
      resourceId: version.id,
      metadata: {
        documentId,
        versionNumber: nextVersionNumber,
        fileType: file.mimetype,
        fileSizeBytes: file.size,
        checksum,
      },
    });

    // Scan file with ClamAV (async, non-blocking)
    const filePath = this.storageService.getFilePath(fileUrl);
    this.scannerService.scanDocumentVersion(documentId, version.id, filePath).catch((err) => {
      this.logger.warn(`Scan failed for ${fileUrl}: ${err}`);
    });

    // If this version was uploaded on an already APPROVED document,
    // notify all concerned users that an update is available.
    // ISO 27001 A.5.12 — classification-aware notification.
    if (document.status === "APPROVED") {
      try {
        await this.notifyNewDocumentAvailable(
          await this.prisma.document.findUnique({ where: { id: documentId } }),
          true,
        );
      } catch (err) {
        this.logger.warn(
          `notifyNewDocumentAvailable failed for ${documentId}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    return version;
  }

  /**
   * Reimport a new version on a document that has been marked OBSOLETE.
   * - Keeps ALL previous versions / checksums (ISO 27001 A.5.28 — evidence integrity)
   * - Creates a new DocumentVersion with incremented versionNumber
   * - Computes a fresh SHA-256 checksum
   * - Updates document.currentVersionId → new version
   * - Resets status to DRAFT so the document flows through the workflow again
   */
  async reimportObsolete(
    docId: string,
    file: Express.Multer.File,
    changeLog: string | undefined,
    userId: string,
  ) {
    if (!file) {
      throw new BadRequestException("Fichier requis");
    }

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    if (document.status !== "OBSOLETE") {
      throw new BadRequestException(
        "Seuls les documents en statut OBSOLETE peuvent être réimportés",
      );
    }

    // Owner OR ADMIN+ can reimport
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Utilisateur introuvable");
    const userRole = (user.role as UserRole) || UserRole.COLLABORATEUR;
    const isOwner = document.ownerId === userId;
    const isAdmin = (ROLE_HIERARCHY[userRole] ?? 0) >= ROLE_HIERARCHY[UserRole.ADMIN];
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        "Seul le propriétaire ou un administrateur peut réimporter ce document",
      );
    }

    // Normalise le MIME (ex: .md → text/markdown) avant validation
    normalizeMimeType(file);
    // MIME validation — same rules as uploadVersion
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Type de fichier non autorisé: ${file.mimetype}`);
    }

    // Validate magic bytes — ISO 27001 A.8.28 (prevents MIME spoofing)
    if (file.buffer && !validateMagicBytes(file)) {
      throw new BadRequestException(
        "Le contenu du fichier ne correspond pas au type déclaré (magic bytes invalides)",
      );
    }

    // SHA-256 checksum (explicit per spec)
    const newHash = crypto.createHash("sha256").update(file.buffer).digest("hex");

    // Prevent re-uploading a file that is byte-identical to an existing version
    const existingVersion = await this.prisma.documentVersion.findFirst({
      where: { documentId: docId, checksum: newHash },
    });
    if (existingVersion) {
      throw new BadRequestException(
        "Ce fichier est identique à une version existante (même checksum)",
      );
    }

    // Upload file (previous versions are preserved)
    const { fileUrl } = await this.storageService.upload(file, `documents/${docId}`);

    // Increment version number (major bump)
    const lastVersion = document.versions[0];
    const oldVersion = lastVersion?.versionNumber || null;
    const oldHash = lastVersion?.checksum || null;
    let nextVersionNumber = "1.0";
    if (lastVersion) {
      const parts = lastVersion.versionNumber.split(".");
      const major = parseInt(parts[0], 10);
      nextVersionNumber = `${major + 1}.0`;
    }

    // Create new version — DO NOT touch previous versions
    const version = await this.prisma.documentVersion.create({
      data: {
        documentId: docId,
        versionNumber: nextVersionNumber,
        fileUrl,
        fileType: file.mimetype,
        fileSizeBytes: file.size,
        checksum: newHash,
        changeLog: changeLog || "Réimport après obsolescence",
        uploadedById: userId,
      },
    });

    // Document points to the new version, status → DRAFT (restart workflow)
    await this.prisma.document.update({
      where: { id: docId },
      data: {
        currentVersionId: version.id,
        status: "DRAFT",
      },
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_REIMPORTED",
      resourceType: "Document",
      resourceId: docId,
      severity: "WARN",
      metadata: {
        title: document.title,
        reference: document.reference,
        oldHash,
        newHash,
        oldVersion,
        newVersion: nextVersionNumber,
        newVersionId: version.id,
      },
    });

    // Trigger async scan
    const filePath = this.storageService.getFilePath(fileUrl);
    this.scannerService.scanDocumentVersion(docId, version.id, filePath).catch((err) => {
      this.logger.warn(`Scan failed for ${fileUrl}: ${err}`);
    });

    this.logger.log(
      `Document ${document.reference} reimported (v${oldVersion ?? "-"} → v${nextVersionNumber}) by user ${userId}`,
    );

    return {
      message: "Document réimporté avec succès, repassé en DRAFT",
      version,
    };
  }

  /**
   * Broadcasts a "new document available" notification to every user
   * allowed to see the document under its classification.
   * ISO 27001 A.5.12 — classification-aware access control.
   *
   * - PUBLIC       → all active users
   * - INTERNE      → all active users except PRESTATAIRE
   * - CONFIDENTIEL → ADMIN, SUPER_ADMIN, DIRECTION, REVIEWER
   * - SECRET       → SUPER_ADMIN only
   */
  async notifyNewDocumentAvailable(
    document: {
      id: string;
      title: string;
      reference: string;
      category: string;
      classification: string | null;
    } | null,
    isUpdate = false,
  ) {
    if (!document) return { sent: 0 };

    const classification = (document.classification || "INTERNE").toUpperCase();

    let roleFilter: UserRole[] | undefined;
    switch (classification) {
      case "PUBLIC":
        roleFilter = undefined; // all active users
        break;
      case "INTERNE":
        roleFilter = [
          UserRole.SUPER_ADMIN,
          UserRole.ADMIN,
          UserRole.DIRECTION,
          UserRole.REVIEWER,
          UserRole.AUDITEUR,
          UserRole.COLLABORATEUR,
        ];
        break;
      case "CONFIDENTIEL":
        roleFilter = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTION, UserRole.REVIEWER];
        break;
      case "SECRET":
        roleFilter = [UserRole.SUPER_ADMIN];
        break;
      default:
        roleFilter = [
          UserRole.SUPER_ADMIN,
          UserRole.ADMIN,
          UserRole.DIRECTION,
          UserRole.REVIEWER,
          UserRole.AUDITEUR,
          UserRole.COLLABORATEUR,
        ];
    }

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(roleFilter ? { role: { in: roleFilter as PrismaUserRole[] } } : {}),
      },
      select: { id: true },
    });

    const title = isUpdate ? "Mise à jour disponible" : "Nouveau document disponible";
    const body = isUpdate
      ? `"${document.title}" (${document.reference}) a été mis à jour. Catégorie : ${document.category}. Cliquez pour consulter la nouvelle version.`
      : `"${document.title}" (${document.reference}) vient d'être publié. Catégorie : ${document.category}. Cliquez pour consulter.`;

    let sent = 0;
    for (const u of users) {
      try {
        await this.notificationsService.create({
          userId: u.id,
          // NB: 'DOC_NEW_AVAILABLE' was requested in spec; we map it to
          // the closest existing NotificationType enum value (DOC_PUBLISHED)
          // to avoid a Prisma enum violation at runtime.
          type: "DOC_PUBLISHED",
          title,
          body,
          resourceType: "Document",
          resourceId: document.id,
        });
        sent++;
      } catch (err) {
        this.logger.warn(
          `notifyNewDocumentAvailable: user ${u.id} failed: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    this.logger.log(
      `notifyNewDocumentAvailable(${document.reference}, update=${isUpdate}, class=${classification}): ${sent}/${users.length} users notified`,
    );

    return { sent, total: users.length };
  }

  async getVersions(documentId: string, currentUser?: RequestUser) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    if (currentUser) {
      this.checkClassificationAccess(document, currentUser);
    }

    return this.prisma.documentVersion.findMany({
      where: { documentId },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getDownloadUrl(documentId: string, versionId: string, currentUser: RequestUser) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    // Access check (ISO 27001 A.5.12 — same rules as findById)
    const userRole = (currentUser.role || "").toUpperCase() as UserRole;
    const isOwner = document.ownerId === currentUser.id;
    const classification = document.classification || "INTERNE";

    if (userRole === UserRole.PRESTATAIRE) {
      if (
        !isOwner &&
        (document.status !== "APPROVED" || (document.category !== "CONTRACT" && !document.isPublic))
      ) {
        throw new ForbiddenException("Accès refusé");
      }
    } else if (userRole === UserRole.COLLABORATEUR) {
      if (!isOwner) {
        if (document.status !== "APPROVED") throw new ForbiddenException("Accès refusé");
        if (!["PUBLIC", "INTERNE"].includes(classification)) {
          throw new ForbiddenException("Niveau de classification insuffisant");
        }
      }
    } else if (userRole === UserRole.AUDITEUR) {
      if (document.status !== "APPROVED") throw new ForbiddenException("Accès refusé");
      if (classification === "SECRET")
        throw new ForbiddenException("Niveau de classification insuffisant");
    } else if (userRole === UserRole.REVIEWER) {
      if (!isOwner && classification === "SECRET") {
        throw new ForbiddenException("Niveau de classification insuffisant");
      }
    }

    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
    });

    if (!version) {
      throw new NotFoundException("Version introuvable");
    }

    const signedUrl = await this.storageService.generateSignedUrl(version.fileUrl, 3600);

    await this.auditService.log({
      userId: currentUser.id,
      action: "DOCUMENT_DOWNLOADED",
      resourceType: "DocumentVersion",
      resourceId: versionId,
      // classification + sévérité : permet au SIEM/Graylog de prioriser/alerter
      // sur les téléchargements sensibles. On plafonne à WARN (jamais CRITICAL) :
      // un téléchargement autorisé n'est pas un événement « critique » et ne doit
      // pas polluer AuditLog.getStats().criticalEvents (rapport ISO trimestriel,
      // réservé aux anomalies). Graylog peut alerter sur metadata.classification.
      metadata: { documentId, versionNumber: version.versionNumber, classification },
      severity: classification === "SECRET" ? "WARN" : "INFO",
    });

    return {
      url: signedUrl,
      fileName: version.fileUrl,
      fileType: version.fileType,
      versionNumber: version.versionNumber,
      documentReference: document.reference,
      documentTitle: document.title,
    };
  }

  async getHistory(documentId: string, currentUser?: RequestUser) {
    // Classification-based access check before exposing history
    if (currentUser) {
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });
      if (!document || document.deletedAt) {
        throw new NotFoundException("Document introuvable");
      }
      this.checkClassificationAccess(document, currentUser);
    }

    const [versions, auditLogs] = await Promise.all([
      this.prisma.documentVersion.findMany({
        where: { documentId },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.auditLog.findMany({
        where: { resourceType: "Document", resourceId: documentId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    // Merge and sort by date
    const timeline = [
      ...versions.map((v) => ({
        type: "version" as const,
        date: v.createdAt,
        versionNumber: v.versionNumber,
        changeLog: v.changeLog,
        user: v.uploadedBy,
        fileSize: v.fileSizeBytes,
      })),
      ...auditLogs.map((l) => ({
        type: "audit" as const,
        date: l.createdAt,
        action: l.action,
        metadata: l.metadata,
        user: l.user,
        severity: l.severity,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { timeline, versions, auditLogs };
  }

  async getStatistics() {
    return this.cacheService.wrap("stats:documents:global", 300, async () => {
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 3600000);

      const [
        total,
        byCategory,
        byStatus,
        byClassification,
        approvedDocs,
        approachingReview,
        topContributors,
      ] = await Promise.all([
        // Repository pattern : count + groupBy via DocumentsRepository.
        this.repo.count({ deletedAt: null }),
        this.repo.groupByCategory({ deletedAt: null }),
        this.repo.groupByStatus({ deletedAt: null }),
        this.prisma.document.groupBy({
          by: ["classification"],
          _count: true,
          where: { deletedAt: null },
        }),
        // Documents that went from DRAFT to APPROVED (for avg time calculation)
        this.prisma.document.findMany({
          where: { deletedAt: null, status: "APPROVED" },
          select: { createdAt: true, updatedAt: true },
        }),
        // Documents approaching review date (next 30 days)
        this.prisma.document.findMany({
          where: {
            deletedAt: null,
            nextReviewDate: { gte: now, lte: in30Days },
          },
          select: {
            id: true,
            title: true,
            reference: true,
            nextReviewDate: true,
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { nextReviewDate: "asc" },
        }),
        // Most active contributors (top 5 by document count)
        this.prisma.document.groupBy({
          by: ["ownerId"],
          _count: true,
          where: { deletedAt: null },
          orderBy: { _count: { ownerId: "desc" } },
          take: 5,
        }),
      ]);

      // Calculate average time from DRAFT to APPROVED (in days)
      let avgDraftToApprovedDays: number | null = null;
      if (approvedDocs.length > 0) {
        const totalMs = approvedDocs.reduce((sum, doc) => {
          return sum + (doc.updatedAt.getTime() - doc.createdAt.getTime());
        }, 0);
        avgDraftToApprovedDays =
          Math.round((totalMs / approvedDocs.length / (24 * 3600000)) * 10) / 10;
      }

      // Enrich top contributors with user info
      const contributorIds = topContributors.map((c) => c.ownerId);
      const contributorUsers =
        contributorIds.length > 0
          ? await this.prisma.user.findMany({
              where: { id: { in: contributorIds } },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            })
          : [];
      const userMap = new Map(contributorUsers.map((u) => [u.id, u]));
      const topContributorsEnriched = topContributors.map((c) => ({
        user: userMap.get(c.ownerId) || { id: c.ownerId },
        documentCount: c._count,
      }));

      // Count documents approved in the last 30 days
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600000);
      const recentlyApproved = await this.prisma.document.count({
        where: {
          deletedAt: null,
          status: "APPROVED",
          updatedAt: { gte: thirtyDaysAgo },
        },
      });

      return {
        total,
        byCategory: byCategory.map((c) => ({
          category: c.category,
          count: c._count,
        })),
        byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
        byClassification: byClassification.map((c) => ({
          classification: c.classification,
          count: c._count,
        })),
        recentlyApproved,
        avgDraftToApprovedDays,
        approachingReview,
        topContributors: topContributorsEnriched,
      };
    });
  }

  async generateReference(category: string, domain: string): Promise<string> {
    const catCode = CATEGORY_CODE_PRO_040[category] ?? category.substring(0, 3).toUpperCase();
    const domCode = domain.substring(0, 3).toUpperCase();
    const prefix = `OMS-${catCode}-${domCode}`;

    const lastDoc = await this.prisma.document.findFirst({
      where: {
        reference: { startsWith: prefix },
      },
      orderBy: { reference: "desc" },
    });

    let seq = 1;
    if (lastDoc) {
      const parts = lastDoc.reference.split("-");
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        seq = lastSeq + 1;
      }
    }

    return `${prefix}-${seq.toString().padStart(4, "0")}`;
  }
}
