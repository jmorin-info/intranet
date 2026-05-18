import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UserRole } from "../common/enums";
import { RequestUser } from "../common/interfaces";
import { CampaignsService, CreateCampaignOptions } from "./campaigns.service";

/**
 * Controleur des campagnes de signature DocuSeal.
 * Scaffold 2026-04-13 — a activer apres migration Prisma.
 */
@Controller("signature-campaigns")
export class CampaignsController {
  private readonly logger = new Logger(CampaignsController.name);

  constructor(private readonly campaigns: CampaignsService) {}

  // ----- Endpoints admin ------------------------------------------

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTION)
  async list() {
    return this.campaigns.findAll();
  }

  @Post("from-charte/:charteId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async createFromCharte(
    @Param("charteId") charteId: string,
    @Body() body: Omit<CreateCampaignOptions, "createdById">,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.createFromCharte(charteId, {
      ...body,
      createdById: user.id,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    });
  }

  @Post("from-document/:documentId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async createFromDocument(
    @Param("documentId") documentId: string,
    @Body() body: Omit<CreateCampaignOptions, "createdById">,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.createFromDocument(documentId, {
      ...body,
      createdById: user.id,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    });
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTION)
  async detail(@Param("id") id: string) {
    return this.campaigns.findOne(id);
  }

  @Post(":id/launch")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async launch(@Param("id") id: string) {
    return this.campaigns.launch(id);
  }

  @Post(":id/remind")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remind(@Param("id") id: string) {
    return this.campaigns.sendReminders(id);
  }

  // ----- Webhook public (signature DocuSeal) ----------------------

  @Public()
  @Post("webhook/docuseal")
  @HttpCode(HttpStatus.OK)
  async webhook(@Req() req: any, @Body() payload: any) {
    const signature =
      (req.headers["x-docuseal-signature"] as string | undefined) ||
      (req.headers["x-docuseal-webhook-signature"] as string | undefined);

    const rawBody =
      (req.rawBody && req.rawBody.toString && req.rawBody.toString("utf8")) ||
      JSON.stringify(payload || {});

    const ok = this.campaigns.verifyWebhookSignature(rawBody, signature);
    if (!ok) {
      this.logger.warn("Signature webhook DocuSeal invalide");
      throw new UnauthorizedException("Invalid webhook signature");
    }

    // TODO: tester — DocuSeal signe generalement avec HMAC-SHA256 sur le body brut,
    // il faut confirmer le header exact et activer le middleware rawBody si absent.
    return this.campaigns.handleWebhook(payload);
  }

  // ----- Endpoint utilisateur -------------------------------------

  @Get("mine/pending")
  @UseGuards(JwtAuthGuard)
  async myPending(@CurrentUser() user: RequestUser) {
    return this.campaigns.findMyPending(user.id);
  }

  // ----- Gestion fine des signataires (ADMIN) -----------------------
  //
  // Permet à un admin de gérer les obligations de signature sans toucher
  // au reste de la campagne :
  //   - DELETE :id/signatures/:userId       : retire l'obligation
  //   - POST   :id/signatures               : ajoute des users (re-relance possible)
  //   - POST   :id/signatures/:userId/reset : remet en PENDING (re-signature requise)
  //   - POST   :id/signatures/:userId/remind: relance ciblée (1 user)
  // Chaque action est tracée dans AuditLog (ISO 27001 A.5.34).

  @Delete(":id/signatures/:userId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async removeSigner(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.removeSigner(id, userId, user.id);
  }

  @Post(":id/signatures")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async addSigners(
    @Param("id") id: string,
    @Body() body: { userIds: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.addSigners(id, body.userIds, user.id);
  }

  @Post(":id/signatures/:userId/reset")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async resetSigner(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.resetSignerStatus(id, userId, user.id, body?.reason);
  }

  @Post(":id/signatures/:userId/remind")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remindOne(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.remindOne(id, userId, user.id);
  }
}
