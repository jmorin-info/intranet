import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';
import { CampaignsService, CreateCampaignOptions } from './campaigns.service';

/**
 * Controleur des campagnes de signature DocuSeal.
 * Scaffold 2026-04-13 — a activer apres migration Prisma.
 */
@Controller('signature-campaigns')
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

  @Post('from-charte/:charteId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async createFromCharte(
    @Param('charteId') charteId: string,
    @Body() body: Omit<CreateCampaignOptions, 'createdById'>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.createFromCharte(charteId, {
      ...body,
      createdById: user.id,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    });
  }

  @Post('from-document/:documentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async createFromDocument(
    @Param('documentId') documentId: string,
    @Body() body: Omit<CreateCampaignOptions, 'createdById'>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.createFromDocument(documentId, {
      ...body,
      createdById: user.id,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTION)
  async detail(@Param('id') id: string) {
    return this.campaigns.findOne(id);
  }

  @Post(':id/launch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async launch(@Param('id') id: string) {
    return this.campaigns.launch(id);
  }

  @Post(':id/remind')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remind(@Param('id') id: string) {
    return this.campaigns.sendReminders(id);
  }

  // ----- Webhook public (signature DocuSeal) ----------------------

  @Public()
  @Post('webhook/docuseal')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: any,
    @Body() payload: any,
  ) {
    const signature =
      (req.headers['x-docuseal-signature'] as string | undefined) ||
      (req.headers['x-docuseal-webhook-signature'] as string | undefined);

    const rawBody =
      (req.rawBody && req.rawBody.toString && req.rawBody.toString('utf8')) ||
      JSON.stringify(payload || {});

    const ok = this.campaigns.verifyWebhookSignature(rawBody, signature);
    if (!ok) {
      this.logger.warn('Signature webhook DocuSeal invalide');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // TODO: tester — DocuSeal signe generalement avec HMAC-SHA256 sur le body brut,
    // il faut confirmer le header exact et activer le middleware rawBody si absent.
    return this.campaigns.handleWebhook(payload);
  }

  // ----- Endpoint utilisateur -------------------------------------

  @Get('mine/pending')
  @UseGuards(JwtAuthGuard)
  async myPending(@CurrentUser() user: RequestUser) {
    return this.campaigns.findMyPending(user.id);
  }
}
