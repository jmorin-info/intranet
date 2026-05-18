import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { OAuthCredsService } from "../calendar/oauth-creds.service";

/**
 * Admin endpoints — Calendar OAuth credentials runtime management.
 *
 * Permet à un SUPER_ADMIN de poser/rotater les Client ID + Client Secret
 * Google et Microsoft sans toucher au `.env` ni redémarrer le backend.
 *
 * Stockage :
 *   - client_id        → AppConfig (plaintext)
 *   - client_secret    → AppConfig "*_enc" chiffré AES-256-GCM via CryptoService
 *   - tenant (Outlook) → AppConfig (plaintext)
 *
 * À l'écriture, on appelle `OAuthCredsService.refresh()` qui recharge le
 * cache mémoire — les nouveaux creds prennent effet immédiatement (sur
 * cette instance ; en cluster il faudrait un cache invalidation cross-node,
 * pas requis pour l'instant — single instance derrière BunkerWeb).
 *
 * Les secrets ne sont JAMAIS retournés en clair par l'API. La réponse de
 * GET expose seulement la source (db|env|none) + un booléen `hasSecret`.
 */
@Controller("admin/integrations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminIntegrationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly creds: OAuthCredsService,
  ) {}

  /**
   * Statut des creds Google + Outlook (sans jamais révéler les secrets).
   *
   * Réponse :
   * ```
   * {
   *   redirectUris: { google, outlook },
   *   google:  { clientId, clientIdSource, hasSecret, secretSource },
   *   outlook: { clientId, clientIdSource, hasSecret, secretSource,
   *              tenantId, tenantSource }
   * }
   * ```
   */
  @Get("oauth")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getStatus() {
    await this.creds.refresh(); // garantit la fraîcheur sur cette instance
    const sources = await this.creds.describeSource();
    const g = this.creds.getGoogle();
    const o = this.creds.getOutlook();
    const base = (process.env.APP_URL || "http://localhost:3000").replace(
      /\/$/,
      "",
    );
    return {
      redirectUris: {
        google: `${base}/api/v1/calendar/callback/google`,
        outlook: `${base}/api/v1/calendar/callback/outlook`,
      },
      google: {
        clientId: g.clientId,
        clientIdSource: sources.google.clientIdSource,
        hasSecret: sources.google.hasSecret,
        secretSource: sources.google.secretSource,
      },
      outlook: {
        clientId: o.clientId,
        clientIdSource: sources.outlook.clientIdSource,
        hasSecret: sources.outlook.hasSecret,
        secretSource: sources.outlook.secretSource,
        tenantId: o.tenantId,
        tenantSource: sources.outlook.tenantSource,
      },
    };
  }

  /**
   * Met à jour les creds Google. Body :
   *   - clientId?: string         (vide → clear DB override, fallback env)
   *   - clientSecret?: string     (vide → clear DB override, fallback env)
   * Au moins un champ doit être présent.
   */
  @Patch("oauth/google")
  @Roles(UserRole.SUPER_ADMIN)
  async updateGoogle(
    @Body() body: { clientId?: string; clientSecret?: string },
  ) {
    await this.upsertOrClear(
      "integrations.google.client_id",
      body.clientId,
      false,
    );
    await this.upsertOrClear(
      "integrations.google.client_secret_enc",
      body.clientSecret,
      true,
    );
    await this.creds.refresh();
    void this.audit.log({
      action: "INTEGRATION_OAUTH_UPDATED",
      resourceType: "AppConfig",
      resourceId: "integrations.google",
      severity: "WARN",
      metadata: {
        provider: "GOOGLE",
        clientIdChanged: body.clientId !== undefined,
        clientSecretChanged: body.clientSecret !== undefined,
      },
    });
    return this.getStatus();
  }

  /**
   * Met à jour les creds Outlook. Body :
   *   - clientId?: string
   *   - clientSecret?: string
   *   - tenantId?: string         ("common" | "<guid>")
   */
  @Patch("oauth/outlook")
  @Roles(UserRole.SUPER_ADMIN)
  async updateOutlook(
    @Body()
    body: {
      clientId?: string;
      clientSecret?: string;
      tenantId?: string;
    },
  ) {
    await this.upsertOrClear(
      "integrations.outlook.client_id",
      body.clientId,
      false,
    );
    await this.upsertOrClear(
      "integrations.outlook.client_secret_enc",
      body.clientSecret,
      true,
    );
    await this.upsertOrClear(
      "integrations.outlook.tenant_id",
      body.tenantId,
      false,
    );
    await this.creds.refresh();
    void this.audit.log({
      action: "INTEGRATION_OAUTH_UPDATED",
      resourceType: "AppConfig",
      resourceId: "integrations.outlook",
      severity: "WARN",
      metadata: {
        provider: "OUTLOOK",
        clientIdChanged: body.clientId !== undefined,
        clientSecretChanged: body.clientSecret !== undefined,
        tenantIdChanged: body.tenantId !== undefined,
      },
    });
    return this.getStatus();
  }

  /**
   * Helper : upsert si valeur non vide, supprime la ligne si chaîne vide,
   * ignore si undefined. Si `encrypt=true`, chiffre avant de stocker.
   */
  private async upsertOrClear(
    key: string,
    value: string | undefined,
    encrypt: boolean,
  ): Promise<void> {
    if (value === undefined) return;
    const trimmed = value.trim();
    if (trimmed === "") {
      await this.prisma.appConfig.deleteMany({ where: { key } });
      return;
    }
    const stored = encrypt ? this.crypto.encrypt(trimmed) : trimmed;
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value: stored, updatedAt: new Date() },
      update: { value: stored, updatedAt: new Date() },
    });
  }
}
