import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * DocumentsRepository — data-access layer for Document entity.
 *
 * Encapsule les operations Prisma de lecture sur les documents. Le service
 * `DocumentsService` est massif (~2100 lignes) et migrer toutes les routes
 * d'un seul coup serait risque a quelques jours du lancement v1.1. Cette
 * premiere passe extrait les methodes de lecture (findById/findAll/count)
 * qui sont les plus testables et les plus utilisees par les autres modules
 * (search, RAG, dashboards).
 *
 * Les operations d'ecriture (create/update/softDelete/upload) restent dans
 * le service tant que la migration progressive est documentee dans
 * `docs/architecture/REPOSITORY_PATTERN.md`.
 */

// Include partage entre findAll (liste) et listing dashboards
const DOCUMENT_LIST_INCLUDE = {
  owner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  isoControls: {
    include: { isoControl: true },
  },
  _count: {
    select: { acknowledgments: true, versions: true },
  },
} as const;

// Include detaille pour findById — versions completes + signatures + ACK
// + validation requests (workflow d'approbation 4-eyes ISO 27001 A.5.1).
const DOCUMENT_DETAIL_INCLUDE = {
  owner: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  verifier: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  reviewer: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  approver: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  versions: {
    orderBy: { createdAt: "desc" as const },
    include: {
      uploadedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      signatureRequests: {
        include: {
          signer: {
            select: { id: true, firstName: true, lastName: true },
          },
          requestedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
    },
  },
  isoControls: {
    include: { isoControl: true },
  },
  acknowledgments: {
    select: {
      id: true,
      userId: true,
      acknowledgedAt: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  validationRequests: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: {
      steps: {
        orderBy: { createdAt: "desc" as const },
        include: {
          assignedTo: {
            select: { id: true, firstName: true, lastName: true },
          },
          // Décideur RÉEL de l'étape (≠ assigné en cas de dérogation ADMIN) —
          // c'est lui qu'affiche la timeline (ISO 27001 A.5.1).
          decidedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Read operations (extraites en premier — testable et reutilisable) ──

  async findById(id: string) {
    return this.prisma.document.findUnique({
      where: { id },
      include: DOCUMENT_DETAIL_INCLUDE,
    });
  }

  async findByIdRaw(id: string) {
    return this.prisma.document.findUnique({ where: { id } });
  }

  async findManyWithCount(
    where: Prisma.DocumentWhereInput,
    orderBy: Prisma.DocumentOrderByWithRelationInput,
    skip: number,
    take: number,
  ) {
    return Promise.all([
      this.prisma.document.findMany({
        where,
        include: DOCUMENT_LIST_INCLUDE,
        orderBy,
        skip,
        take,
      }),
      this.prisma.document.count({ where }),
    ]);
  }

  async count(where?: Prisma.DocumentWhereInput): Promise<number> {
    return this.prisma.document.count({ where });
  }

  async groupByCategory(where?: Prisma.DocumentWhereInput) {
    return this.prisma.document.groupBy({
      by: ["category"],
      where,
      _count: true,
    });
  }

  async groupByStatus(where?: Prisma.DocumentWhereInput) {
    return this.prisma.document.groupBy({
      by: ["status"],
      where,
      _count: true,
    });
  }

  // ── Bulk operations (utilisees par bulkSoftDelete/bulkArchive/bulkClassify) ──

  async findManyForBulk(ids: string[]) {
    return this.prisma.document.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        title: true,
        reference: true,
        ownerId: true,
        classification: true,
        status: true,
      },
    });
  }

  async updateMany(where: Prisma.DocumentWhereInput, data: Prisma.DocumentUpdateManyMutationInput) {
    return this.prisma.document.updateMany({ where, data });
  }
}
