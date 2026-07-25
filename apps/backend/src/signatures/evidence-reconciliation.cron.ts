import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SignaturesService } from './signatures.service';
import { EvidenceService } from './evidence.service';

/**
 * Réconciliation des preuves de signature (eIDAS-AES) — toutes les 6 h.
 *
 * Une SignatureRequest SIGNED doit TOUJOURS avoir une SignatureEvidence.
 * Ce cron rattrape les cas où la capture a échoué ou n'a jamais eu lieu :
 *  - webhook reçu mais captureEvidence en erreur (best-effort historique) ;
 *  - signatures historiques passées par signDirectly (sans webhook) ;
 *  - webhook jamais reçu (DocuSeal down au moment de l'événement).
 *
 * Stratégie par demande :
 *  1. Si docusealSubmissionId existe et webhookPayload manquant :
 *     re-interroger l'API DocuSeal et persister la réponse comme payload
 *     (source de vérité pour l'identité signataire et le PDF signé).
 *  2. Capturer l'evidence via EvidenceService (idempotent).
 *
 * Règle absolue : NE JAMAIS throw depuis un cron — on log et on continue.
 */
@Injectable()
export class EvidenceReconciliationCron {
  private readonly logger = new Logger(EvidenceReconciliationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signaturesService: SignaturesService,
    private readonly evidenceService: EvidenceService,
  ) {}

  @Cron('0 */6 * * *')
  async run() {
    try {
      const result = await this.reconcile();
      if (result.total > 0) {
        this.logger.log(
          `Réconciliation evidence : ${result.captured}/${result.total} capturées, ${result.failed} échecs`,
        );
      }
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`Erreur cron réconciliation evidence: ${e.message}`, e.stack);
    }
  }

  /**
   * Réconcilie toutes les SignatureRequest SIGNED sans evidence.
   * Gestion d'erreur par demande : un échec n'interrompt pas les autres.
   */
  async reconcile(): Promise<{ total: number; captured: number; failed: number }> {
    const orphans = await this.prisma.signatureRequest.findMany({
      where: {
        status: 'SIGNED',
        evidence: { is: null },
      },
      select: {
        id: true,
        docusealSubmissionId: true,
        webhookPayload: true,
        signedFileUrl: true,
      },
      // Volume attendu quasi nul en régime nominal — borne de sécurité.
      take: 200,
    });

    let captured = 0;
    let failed = 0;

    for (const sig of orphans) {
      try {
        // 1. Recompléter le payload depuis l'API DocuSeal si possible.
        if (sig.docusealSubmissionId && !sig.webhookPayload) {
          const submission = await this.signaturesService.getSubmission(
            sig.docusealSubmissionId,
          );
          if (submission && typeof submission === 'object') {
            const sub = submission as {
              documents?: Array<{ url?: string }>;
            };
            await this.prisma.signatureRequest.update({
              where: { id: sig.id },
              data: {
                webhookPayload: {
                  event_type: 'reconciliation.fetch',
                  fetchedAt: new Date().toISOString(),
                  data: submission,
                } as any,
                signedFileUrl:
                  sig.signedFileUrl || sub.documents?.[0]?.url || null,
              },
            });
          } else {
            this.logger.warn(
              `Réconciliation ${sig.id} : submission DocuSeal ${sig.docusealSubmissionId} introuvable — capture avec les données locales`,
            );
          }
        }

        // 2. Capture idempotente (fallback identité DB si payload absent).
        const saved = await this.evidenceService.captureEvidence(sig.id);
        if (saved.id) {
          captured++;
          this.logger.log(`Evidence réconciliée pour SignatureRequest ${sig.id}`);
        } else {
          failed++;
        }
      } catch (err: unknown) {
        failed++;
        const e = err instanceof Error ? err : new Error(String(err));
        this.logger.error(
          `Réconciliation evidence échouée pour ${sig.id}: ${e.message}`,
        );
      }
    }

    return { total: orphans.length, captured, failed };
  }
}
