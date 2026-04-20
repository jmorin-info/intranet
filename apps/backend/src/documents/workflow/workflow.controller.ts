import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { WorkflowService, REJECTION_SUGGESTIONS } from './workflow.service';
import { RequestUser } from '../../common/interfaces';
import { UserRole } from '../../common/enums';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('pending')
  getPending(@CurrentUser() user: RequestUser) {
    return this.workflowService.getPendingForUser(
      user.id,
      user.role as UserRole,
    );
  }

  @Post(':id/submit-review')
  submitForReview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.submitForReview(id, user.id);
  }

  @Post(':id/approve-review')
  @Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  approveReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('comment') comment: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.approveReview(id, user.id, comment);
  }

  /**
   * Étape 3 — le rédacteur confirme et lance la demande d'approbation finale.
   * Accessible à tous les rôles (la vérification owner-only est dans le service).
   * ISO 27001 A.5.1 — séparation des responsabilités dans le workflow.
   */
  @Post(':id/request-approval')
  requestApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('comment') comment: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.requestApproval(id, user.id, comment);
  }

  @Post(':id/reject-review')
  @Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  rejectReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { comment: string; suggestions?: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.rejectReview(id, user.id, body.comment, body.suggestions);
  }

  /**
   * Catalogue des suggestions pré-définies proposées lors d'un refus.
   * Le frontend les affiche sous forme de cases à cocher pour guider le reviewer.
   */
  @Get('rejection-suggestions')
  getRejectionSuggestions() {
    return {
      categories: [
        {
          name: 'Forme',
          items: [
            { key: 'fix-typos', label: REJECTION_SUGGESTIONS['fix-typos'] },
            { key: 'improve-clarity', label: REJECTION_SUGGESTIONS['improve-clarity'] },
            { key: 'fix-formatting', label: REJECTION_SUGGESTIONS['fix-formatting'] },
            { key: 'add-examples', label: REJECTION_SUGGESTIONS['add-examples'] },
            { key: 'simplify-language', label: REJECTION_SUGGESTIONS['simplify-language'] },
          ],
        },
        {
          name: 'Fond',
          items: [
            { key: 'clarify-scope', label: REJECTION_SUGGESTIONS['clarify-scope'] },
            { key: 'add-definitions', label: REJECTION_SUGGESTIONS['add-definitions'] },
            { key: 'detail-procedure', label: REJECTION_SUGGESTIONS['detail-procedure'] },
            { key: 'add-responsibilities', label: REJECTION_SUGGESTIONS['add-responsibilities'] },
            { key: 'add-metrics', label: REJECTION_SUGGESTIONS['add-metrics'] },
          ],
        },
        {
          name: 'Conformité',
          items: [
            { key: 'add-iso-references', label: REJECTION_SUGGESTIONS['add-iso-references'] },
            { key: 'add-legal-references', label: REJECTION_SUGGESTIONS['add-legal-references'] },
            { key: 'check-classification', label: REJECTION_SUGGESTIONS['check-classification'] },
            { key: 'add-retention', label: REJECTION_SUGGESTIONS['add-retention'] },
            { key: 'add-review-date', label: REJECTION_SUGGESTIONS['add-review-date'] },
          ],
        },
        {
          name: 'Sécurité',
          items: [
            { key: 'security-review', label: REJECTION_SUGGESTIONS['security-review'] },
            { key: 'risk-analysis', label: REJECTION_SUGGESTIONS['risk-analysis'] },
            { key: 'update-threats', label: REJECTION_SUGGESTIONS['update-threats'] },
          ],
        },
        {
          name: 'Processus',
          items: [
            { key: 'align-with-policy', label: REJECTION_SUGGESTIONS['align-with-policy'] },
            { key: 'check-cross-refs', label: REJECTION_SUGGESTIONS['check-cross-refs'] },
            { key: 'update-version-history', label: REJECTION_SUGGESTIONS['update-version-history'] },
          ],
        },
      ],
    };
  }

  @Post(':id/approve')
  @Roles(UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  approveDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('comment') comment: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.approveDocument(id, user.id, comment);
  }

  @Post(':id/reject')
  @Roles(UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  rejectDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { comment: string; suggestions?: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.rejectDocument(id, user.id, body.comment, body.suggestions);
  }

  @Post(':id/obsolete')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  markObsolete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.markObsolete(id, user.id);
  }

  @Public()
  @Get('email-action')
  async emailAction(
    @Query('action') action: string,
    @Query('docId') docId: string,
    @Query('userId') userId: string,
    @Query('token') token: string,
    @Query('ts') ts: string,
    @Res() res: Response,
  ) {
    const crypto = await import('crypto');
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) { res.status(500).send('Server configuration error'); return; }

    // Validate required params
    if (!action || !docId || !userId || !token || !ts) {
      return res.status(400).send('<html><body><h1>Lien incomplet</h1><p>Paramètres manquants.</p></body></html>');
    }

    // Validate timestamp: must be a number, within 72 hours
    const tokenTimestamp = parseInt(ts, 10);
    if (isNaN(tokenTimestamp)) {
      return res.status(403).send('<html><body><h1>Lien invalide</h1></body></html>');
    }
    const TOKEN_MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours
    const tokenAge = Date.now() - tokenTimestamp;
    if (tokenAge < 0 || tokenAge > TOKEN_MAX_AGE_MS) {
      return res.status(403).send(
        '<html><body style="font-family:sans-serif;text-align:center;padding:40px;">' +
        '<h1 style="color:#cc0000;">Lien expiré</h1>' +
        '<p>Ce lien de validation a expiré (validité : 72 heures).</p>' +
        '<p>Veuillez vous connecter à l\'intranet pour effectuer cette action.</p>' +
        `<a href="${process.env.APP_URL || 'http://localhost:3001'}/documents/${docId}" style="color:#F68D2E;">Ouvrir le document</a>` +
        '</body></html>',
      );
    }

    // Timing-safe HMAC comparison (includes timestamp to prevent replay)
    const expected = crypto.createHmac('sha256', secret)
      .update(`${action}:${docId}:${userId}:${ts}`)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const tokenBuf = Buffer.from(token, 'utf-8');
    const expectedBuf = Buffer.from(expected, 'utf-8');
    if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
      return res.status(403).send('<html><body><h1>Lien invalide ou expiré</h1></body></html>');
    }

    // Validate action value
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).send('<html><body><h1>Action invalide</h1></body></html>');
    }

    try {
      if (action === 'approve') {
        await this.workflowService.approveReview(docId, userId, 'Approuvé par email');
      } else {
        await this.workflowService.rejectReview(docId, userId, 'Rejeté par email');
      }
      return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px;">
        <h1 style="color:#004469;">\u2713 Document ${action === 'approve' ? 'approuvé' : 'rejeté'}</h1>
        <p>Vous pouvez fermer cette page.</p>
        <a href="${process.env.APP_URL || 'http://localhost:3001'}/documents/${docId}" style="color:#F68D2E;">Voir le document</a>
      </body></html>`);
    } catch (err: any) {
      return res.status(400).send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px;">
        <h1 style="color:#cc0000;">Erreur</h1>
        <p>${err.message || 'Une erreur est survenue.'}</p>
        <a href="${process.env.APP_URL || 'http://localhost:3001'}/documents/${docId}" style="color:#F68D2E;">Voir le document</a>
      </body></html>`);
    }
  }
}
