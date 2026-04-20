import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * DataRetentionService — automated document retention / archival policy
 * (ISO 27001:2022 A.5.33 — Protection of records).
 *
 * Policy (all thresholds configurable via env, defaults in days):
 *  - Documents APPROVED and untouched for > RETENTION_DOC_ARCHIVE_DAYS (3y)
 *    become candidates for archival (status → ARCHIVED).
 *  - Soft-deleted documents (deletedAt != null) past
 *    RETENTION_DOC_DELETE_DAYS (7y — RGPD max) are candidates for hard delete.
 *  - AuditLog rows older than RETENTION_AUDIT_KEEP_DAYS (5y) are purged.
 *
 * All destructive operations run in dry-run mode by default. The caller must
 * pass `applyChanges=true` to actually mutate data. Each action is audited.
 */
@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);

  // Configurable retention windows (days). Defaults: 3y archive, 7y delete, 5y audit keep.
  private readonly DOC_ARCHIVE_AFTER_DAYS = parseInt(
    process.env.RETENTION_DOC_ARCHIVE_DAYS || '1095',
    10,
  );
  private readonly DOC_DELETE_AFTER_DAYS = parseInt(
    process.env.RETENTION_DOC_DELETE_DAYS || '2555',
    10,
  );
  private readonly AUDIT_LOG_KEEP_DAYS = parseInt(
    process.env.RETENTION_AUDIT_KEEP_DAYS || '1825',
    10,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private daysAgo(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }

  private policySnapshot() {
    return {
      docArchiveAfterDays: this.DOC_ARCHIVE_AFTER_DAYS,
      docDeleteAfterDays: this.DOC_DELETE_AFTER_DAYS,
      auditLogKeepDays: this.AUDIT_LOG_KEEP_DAYS,
      autoApply: process.env.RETENTION_AUTO_APPLY === 'true',
    };
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  /**
   * Returns aggregate counts for every retention category plus the active
   * policy snapshot. Read-only: never mutates anything.
   */
  async getStats() {
    const archiveCutoff = this.daysAgo(this.DOC_ARCHIVE_AFTER_DAYS);
    const deleteCutoff = this.daysAgo(this.DOC_DELETE_AFTER_DAYS);
    const auditCutoff = this.daysAgo(this.AUDIT_LOG_KEEP_DAYS);

    const [archivableDocs, deletableDocs, oldAuditLogs] = await Promise.all([
      this.prisma.document.count({
        where: {
          status: 'APPROVED',
          deletedAt: null,
          updatedAt: { lt: archiveCutoff },
        },
      }),
      this.prisma.document.count({
        where: {
          deletedAt: { not: null, lt: deleteCutoff },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          createdAt: { lt: auditCutoff },
        },
      }),
    ]);

    return {
      archivableDocs,
      deletableDocs,
      oldAuditLogs,
      cutoffs: {
        archive: archiveCutoff.toISOString(),
        delete: deleteCutoff.toISOString(),
        audit: auditCutoff.toISOString(),
      },
      policy: this.policySnapshot(),
    };
  }

  // ---------------------------------------------------------------------------
  // Read-only listings
  // ---------------------------------------------------------------------------

  /**
   * Lists documents eligible for archival: APPROVED, not already archived,
   * not soft-deleted, and untouched for longer than the archive threshold.
   */
  async getArchivableDocuments(limit = 50) {
    const take = Math.max(1, Math.min(limit, 500));
    const cutoff = this.daysAgo(this.DOC_ARCHIVE_AFTER_DAYS);

    return this.prisma.document.findMany({
      where: {
        status: 'APPROVED',
        deletedAt: null,
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        title: true,
        reference: true,
        status: true,
        category: true,
        classification: true,
        ownerId: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: { updatedAt: 'asc' },
      take,
    });
  }

  /**
   * Lists soft-deleted documents that have passed the legal retention window
   * and are therefore candidates for hard deletion.
   */
  async getDeletableSoftDeleted(limit = 50) {
    const take = Math.max(1, Math.min(limit, 500));
    const cutoff = this.daysAgo(this.DOC_DELETE_AFTER_DAYS);

    return this.prisma.document.findMany({
      where: {
        deletedAt: { not: null, lt: cutoff },
      },
      select: {
        id: true,
        title: true,
        reference: true,
        status: true,
        deletedAt: true,
        updatedAt: true,
      },
      orderBy: { deletedAt: 'asc' },
      take,
    });
  }

  // ---------------------------------------------------------------------------
  // Policies — archive
  // ---------------------------------------------------------------------------

  /**
   * Archive policy runner. Flips eligible documents from APPROVED → ARCHIVED
   * when `applyChanges` is true; otherwise only reports what would happen.
   * Every affected document is logged via AuditService.
   */
  async runArchivePolicy(applyChanges = false) {
    const cutoff = this.daysAgo(this.DOC_ARCHIVE_AFTER_DAYS);
    const candidates = await this.prisma.document.findMany({
      where: {
        status: 'APPROVED',
        deletedAt: null,
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        reference: true,
        title: true,
        ownerId: true,
        updatedAt: true,
      },
    });

    const processed: Array<{ id: string; reference: string; title: string }> = [];
    const errors: Array<{ id: string; error: string }> = [];

    if (!applyChanges) {
      this.logger.log(
        `runArchivePolicy dry-run: ${candidates.length} candidate(s) >` +
          ` ${this.DOC_ARCHIVE_AFTER_DAYS}d`,
      );
      return {
        dryRun: true,
        candidates: candidates.length,
        processed: candidates.map((c) => ({
          id: c.id,
          reference: c.reference,
          title: c.title,
        })),
        errors,
        cutoff: cutoff.toISOString(),
      };
    }

    for (const doc of candidates) {
      try {
        await this.prisma.document.update({
          where: { id: doc.id },
          data: { status: 'ARCHIVED' },
        });
        await this.audit.log({
          action: 'DOCUMENT_AUTO_ARCHIVED',
          resourceType: 'Document',
          resourceId: doc.id,
          metadata: {
            reference: doc.reference,
            title: doc.title,
            lastUpdatedAt: doc.updatedAt,
            thresholdDays: this.DOC_ARCHIVE_AFTER_DAYS,
            policy: 'ISO27001_A_5_33',
          },
          severity: 'WARN',
        });
        processed.push({
          id: doc.id,
          reference: doc.reference,
          title: doc.title,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(
          `Failed to archive document ${doc.id}: ${msg}`,
          e instanceof Error ? e.stack : undefined,
        );
        errors.push({ id: doc.id, error: msg });
      }
    }

    this.logger.log(
      `runArchivePolicy apply: archived ${processed.length}/${candidates.length}` +
        ` (errors: ${errors.length})`,
    );

    return {
      dryRun: false,
      candidates: candidates.length,
      processed,
      errors,
      cutoff: cutoff.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Policies — hard delete of soft-deleted documents
  // ---------------------------------------------------------------------------

  /**
   * Hard deletes soft-deleted documents older than the legal retention window.
   * Removes linked DocumentVersion rows explicitly first (defensive, even if
   * the schema uses onDelete: Cascade). Dry-run by default.
   */
  async runHardDeletePolicy(applyChanges = false) {
    const cutoff = this.daysAgo(this.DOC_DELETE_AFTER_DAYS);
    const candidates = await this.prisma.document.findMany({
      where: {
        deletedAt: { not: null, lt: cutoff },
      },
      select: { id: true, reference: true, title: true, deletedAt: true },
    });

    if (!applyChanges) {
      this.logger.log(
        `runHardDeletePolicy dry-run: ${candidates.length} candidate(s) >` +
          ` ${this.DOC_DELETE_AFTER_DAYS}d`,
      );
      return {
        dryRun: true,
        candidates: candidates.length,
        deleted: 0,
        errors: [] as Array<{ id: string; error: string }>,
        cutoff: cutoff.toISOString(),
      };
    }

    let deleted = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const doc of candidates) {
      try {
        await this.prisma.$transaction([
          this.prisma.documentVersion.deleteMany({
            where: { documentId: doc.id },
          }),
          this.prisma.document.delete({ where: { id: doc.id } }),
        ]);
        await this.audit.log({
          action: 'DOCUMENT_HARD_DELETED',
          resourceType: 'Document',
          resourceId: doc.id,
          metadata: {
            reference: doc.reference,
            title: doc.title,
            softDeletedAt: doc.deletedAt,
            thresholdDays: this.DOC_DELETE_AFTER_DAYS,
            policy: 'ISO27001_A_5_33',
          },
          severity: 'CRITICAL',
        });
        deleted += 1;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(
          `Failed to hard-delete document ${doc.id}: ${msg}`,
          e instanceof Error ? e.stack : undefined,
        );
        errors.push({ id: doc.id, error: msg });
      }
    }

    this.logger.log(
      `runHardDeletePolicy apply: deleted ${deleted}/${candidates.length}` +
        ` (errors: ${errors.length})`,
    );

    return {
      dryRun: false,
      candidates: candidates.length,
      deleted,
      errors,
      cutoff: cutoff.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Policies — audit log cleanup
  // ---------------------------------------------------------------------------

  /**
   * Removes AuditLog rows older than AUDIT_LOG_KEEP_DAYS. Dry-run counts the
   * rows that would be affected; apply mode uses deleteMany for efficiency.
   */
  async runAuditLogCleanup(applyChanges = false) {
    const cutoff = this.daysAgo(this.AUDIT_LOG_KEEP_DAYS);

    const candidates = await this.prisma.auditLog.count({
      where: { createdAt: { lt: cutoff } },
    });

    if (!applyChanges) {
      this.logger.log(
        `runAuditLogCleanup dry-run: ${candidates} row(s) >` +
          ` ${this.AUDIT_LOG_KEEP_DAYS}d`,
      );
      return {
        dryRun: true,
        candidates,
        deleted: 0,
        cutoff: cutoff.toISOString(),
      };
    }

    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    // Log the cleanup itself *after* the deleteMany so the audit entry
    // documenting the purge is not swept up in the same run.
    await this.audit.log({
      action: 'AUDIT_LOG_CLEANUP',
      resourceType: 'AuditLog',
      metadata: {
        deleted: result.count,
        cutoff: cutoff.toISOString(),
        thresholdDays: this.AUDIT_LOG_KEEP_DAYS,
        policy: 'ISO27001_A_5_33',
      },
      severity: 'WARN',
    });

    this.logger.log(`runAuditLogCleanup apply: deleted ${result.count} row(s)`);

    return {
      dryRun: false,
      candidates,
      deleted: result.count,
      cutoff: cutoff.toISOString(),
    };
  }
}
