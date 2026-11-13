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
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { WorkflowService, REJECTION_SUGGESTIONS } from "./workflow.service";
import { RequestUser } from "../../common/interfaces";
import { UserRole } from "../../common/enums";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Encode HTML text and double-quoted attributes without interpreting entities. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

@Controller("documents")
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get("pending")
  getPending(@CurrentUser() user: RequestUser) {
    return this.workflowService.getPendingForUser(user.id, user.role as UserRole);
  }

  @Post(":id/submit-review")
  submitForReview(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.workflowService.submitForReview(id, user.id);
  }

  /**
   * Étape 1 bis (cycle 5 rôles) — le VÉRIFICATEUR valide le contrôle technique.
   * Pas de @Roles : le vérificateur peut être de n'importe quel rôle
   * (l'assignation fait foi, contrôlée dans le service ; dérogation ADMIN tracée).
   */
  @Post(":id/approve-verification")
  approveVerification(
    @Param("id", ParseUUIDPipe) id: string,
    @Body("comment") comment: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.approveVerification(id, user.id, comment);
  }

  @Post(":id/reject-verification")
  rejectVerification(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { comment: string; suggestions?: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.rejectVerification(id, user.id, body.comment, body.suggestions);
  }

  @Post(":id/approve-review")
  @Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  approveReview(
    @Param("id", ParseUUIDPipe) id: string,
    @Body("comment") comment: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.approveReview(id, user.id, comment);
  }

  /**
   * Étape 3 — le rédacteur confirme et lance la demande d'approbation finale.
   * Accessible à tous les rôles (la vérification owner-only est dans le service).
   * ISO 27001 A.5.1 — séparation des responsabilités dans le workflow.
   */
  @Post(":id/request-approval")
  requestApproval(
    @Param("id", ParseUUIDPipe) id: string,
    @Body("comment") comment: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.requestApproval(id, user.id, comment);
  }

  @Post(":id/reject-review")
  @Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  rejectReview(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { comment: string; suggestions?: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.rejectReview(id, user.id, body.comment, body.suggestions);
  }

  /**
   * Catalogue des suggestions pré-définies proposées lors d'un refus.
   * Le frontend les affiche sous forme de cases à cocher pour guider le reviewer.
   */
  @Get("rejection-suggestions")
  getRejectionSuggestions() {
    return {
      categories: [
        {
          name: "Forme",
          items: [
            { key: "fix-typos", label: REJECTION_SUGGESTIONS["fix-typos"] },
            { key: "improve-clarity", label: REJECTION_SUGGESTIONS["improve-clarity"] },
            { key: "fix-formatting", label: REJECTION_SUGGESTIONS["fix-formatting"] },
            { key: "add-examples", label: REJECTION_SUGGESTIONS["add-examples"] },
            { key: "simplify-language", label: REJECTION_SUGGESTIONS["simplify-language"] },
          ],
        },
        {
          name: "Fond",
          items: [
            { key: "clarify-scope", label: REJECTION_SUGGESTIONS["clarify-scope"] },
            { key: "add-definitions", label: REJECTION_SUGGESTIONS["add-definitions"] },
            { key: "detail-procedure", label: REJECTION_SUGGESTIONS["detail-procedure"] },
            { key: "add-responsibilities", label: REJECTION_SUGGESTIONS["add-responsibilities"] },
            { key: "add-metrics", label: REJECTION_SUGGESTIONS["add-metrics"] },
          ],
        },
        {
          name: "Conformité",
          items: [
            { key: "add-iso-references", label: REJECTION_SUGGESTIONS["add-iso-references"] },
            { key: "add-legal-references", label: REJECTION_SUGGESTIONS["add-legal-references"] },
            { key: "check-classification", label: REJECTION_SUGGESTIONS["check-classification"] },
            { key: "add-retention", label: REJECTION_SUGGESTIONS["add-retention"] },
            { key: "add-review-date", label: REJECTION_SUGGESTIONS["add-review-date"] },
          ],
        },
        {
          name: "Sécurité",
          items: [
            { key: "security-review", label: REJECTION_SUGGESTIONS["security-review"] },
            { key: "risk-analysis", label: REJECTION_SUGGESTIONS["risk-analysis"] },
            { key: "update-threats", label: REJECTION_SUGGESTIONS["update-threats"] },
          ],
        },
        {
          name: "Processus",
          items: [
            { key: "align-with-policy", label: REJECTION_SUGGESTIONS["align-with-policy"] },
            { key: "check-cross-refs", label: REJECTION_SUGGESTIONS["check-cross-refs"] },
            {
              key: "update-version-history",
              label: REJECTION_SUGGESTIONS["update-version-history"],
            },
          ],
        },
      ],
    };
  }

  @Post(":id/approve")
  @Roles(UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  approveDocument(
    @Param("id", ParseUUIDPipe) id: string,
    @Body("comment") comment: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.approveDocument(id, user.id, comment);
  }

  @Post(":id/reject")
  @Roles(UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  rejectDocument(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { comment: string; suggestions?: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.rejectDocument(id, user.id, body.comment, body.suggestions);
  }

  @Post(":id/obsolete")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  markObsolete(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.workflowService.markObsolete(id, user.id);
  }

  @Public()
  @Get("email-action")
  async emailAction(
    @Query("action") action: string,
    @Query("docId") docId: string,
    @Query("userId") userId: string,
    @Query("token") token: string,
    @Query("ts") ts: string,
    @Res() res: Response,
  ) {
    res.set({
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    res.type("html");
    const page = (title: string, message: string, documentUrl?: string) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${documentUrl ? `<a href="${escapeHtml(documentUrl)}">Ouvrir le document</a>` : ""}</body></html>`;
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) return res.status(500).send(page("Erreur de configuration", "L'action est temporairement indisponible."));
    // Express query strings may be arrays or objects despite TS annotations.
    if (typeof action !== "string" || !["approve", "reject"].includes(action) || typeof docId !== "string" || !UUID.test(docId) || typeof userId !== "string" || !UUID.test(userId) || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) || typeof ts !== "string" || !/^\d{13}$/.test(ts)) return res.status(400).send(page("Lien invalide", "Les paramètres du lien sont invalides."));
    const crypto = await import("crypto");
    const expected = crypto.createHmac("sha256", secret).update(`${action}:${docId}:${userId}:${ts}`).digest();
    if (!crypto.timingSafeEqual(Buffer.from(token, "hex"), expected)) return res.status(403).send(page("Lien invalide", "Ce lien n'est pas autorisé."));
    let documentUrl: string;
    try {
      const base = new URL(process.env.APP_URL || "http://localhost:3001");
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("Unsupported app origin");
      documentUrl = new URL(`/documents/${encodeURIComponent(docId)}`, base.origin).href;
    } catch { return res.status(500).send(page("Erreur de configuration", "L'action est temporairement indisponible.")); }
    const tokenAge = Date.now() - Number(ts);
    if (tokenAge < 0 || tokenAge > 72 * 60 * 60 * 1000) return res.status(403).send(page("Lien expiré", "Ce lien de validation a expiré. Connectez-vous à l'intranet pour effectuer cette action.", documentUrl));
    try {
      if (action === "approve") await this.workflowService.approveReview(docId, userId, "Approuvé par email");
      else await this.workflowService.rejectReview(docId, userId, "Rejeté par email");
      return res.send(page(action === "approve" ? "Document approuvé" : "Document rejeté", "Vous pouvez fermer cette page.", documentUrl));
    } catch {
      // Exceptions may contain arbitrary submitted or persisted HTML. The
      // public action page never exposes that internal exception text.
      return res.status(400).send(page("Action impossible", "Cette action n'a pas pu être effectuée. Consultez l'état du document dans l'intranet.", documentUrl));
    }
  }
}
