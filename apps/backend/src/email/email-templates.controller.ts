import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { EmailRenderService, EmailLocale } from "./email-render.service";
import { EmailService } from "./email.service";

/**
 * Wave G — Endpoints admin pour la gestion des templates email MJML.
 *
 * Routes :
 *   GET  /admin/email-templates                  → liste des templates
 *   GET  /admin/email-templates/:name/preview    → preview HTML (?locale=fr|en)
 *   POST /admin/email-templates/:name/test-send  → envoi test &agrave; un email donn&eacute;
 *
 * Acc&egrave;s : ADMIN+ uniquement.
 */
@Controller("admin/email-templates")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class EmailTemplatesController {
  constructor(
    private readonly renderService: EmailRenderService,
    private readonly emailService: EmailService,
  ) {}

  @Get()
  list(): { templates: string[] } {
    return { templates: this.renderService.listTemplates() };
  }

  @Get(":name/preview")
  async preview(
    @Param("name") name: string,
    @Query("locale") locale?: string,
  ): Promise<{
    html: string;
    text: string;
    subject: string;
    locale: EmailLocale;
  }> {
    const safeLocale: EmailLocale = locale === "en" ? "en" : "fr";
    if (!this.renderService.listTemplates().includes(name)) {
      throw new BadRequestException(`Unknown template: ${name}`);
    }
    const rendered = await this.renderService.preview(name, safeLocale);
    return { ...rendered, locale: safeLocale };
  }

  @Post(":name/test-send")
  async testSend(
    @Param("name") name: string,
    @Body() body: { to: string; locale?: EmailLocale; vars?: Record<string, any> },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!body?.to || !body.to.includes("@")) {
      throw new BadRequestException("Champ 'to' requis et valide.");
    }
    if (!this.renderService.listTemplates().includes(name)) {
      throw new BadRequestException(`Unknown template: ${name}`);
    }
    const sample = this.renderService.getSampleVars(name);
    const result = await this.emailService.sendDirect(
      body.to,
      name,
      { ...sample, ...(body.vars || {}) },
      {
        locale: body.locale,
        category: "admin-test",
        noRetry: true,
      },
    );
    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    };
  }
}
