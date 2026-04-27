import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

/**
 * Service d'orchestration des exports de donnees RGPD.
 *
 * Responsabilites :
 *  - Cree l'enregistrement `DataExportRequest` (status PENDING)
 *  - Pousse le job sur la queue BullMQ `data-export` (consomme par
 *    `DataExportProcessor`)
 *  - Expose le statut + URL de telechargement signed quand le job est
 *    termine (status COMPLETED, downloadUrl renseigne)
 *
 * Le processor (data-export.processor.ts) gere la generation effective
 * et met a jour `status`, `filePath`, `completedAt` ou `errorMessage`
 * selon le resultat.
 */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue("data-export") private readonly queue: Queue,
  ) {}

  async requestExport(userId: string): Promise<{
    id: string;
    status: string;
    requestedAt: Date;
  }> {
    const request = await this.prisma.dataExportRequest.create({
      data: {
        userId,
        status: "PENDING",
      },
      select: {
        id: true,
        status: true,
        requestedAt: true,
      },
    });

    // Job dedupliqué par exportRequestId pour eviter les double-runs si
    // le client retry — la queue ne lance qu'un seul worker par jobId.
    await this.queue.add(
      "export",
      {
        userId,
        exportRequestId: request.id,
      },
      {
        jobId: `data-export-${request.id}`,
        // Conserver les jobs failed pour audit pendant 7 jours, puis purge.
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 30_000,
        },
      },
    );

    await this.audit.log({
      userId,
      action: "GDPR_DATA_EXPORT_REQUESTED",
      resourceType: "DataExportRequest",
      resourceId: request.id,
      severity: "INFO",
    });

    this.logger.log(
      `Data export requested by user ${userId} → request ${request.id}`,
    );

    return request;
  }

  async listForUser(userId: string) {
    return this.prisma.dataExportRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        requestedAt: true,
        completedAt: true,
        downloadUrl: true,
        expiresAt: true,
        errorMessage: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.dataExportRequest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        requestedAt: true,
        completedAt: true,
        downloadUrl: true,
        expiresAt: true,
        errorMessage: true,
        filePath: true,
      },
    });
  }

  /**
   * Construit la reponse cliente pour un statut donne. Cache filePath
   * (chemin disque interne) — seul `downloadUrl` est expose.
   */
  getStatusPayload(req: {
    id: string;
    status: string;
    requestedAt: Date;
    completedAt: Date | null;
    downloadUrl: string | null;
    expiresAt: Date | null;
    errorMessage: string | null;
  }) {
    return {
      id: req.id,
      status: req.status,
      requestedAt: req.requestedAt,
      completedAt: req.completedAt,
      downloadUrl: req.downloadUrl,
      expiresAt: req.expiresAt,
      errorMessage: req.errorMessage,
    };
  }
}
