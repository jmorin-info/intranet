import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";

/**
 * OAuth credentials runtime resolver — Wave G item 33.
 *
 * Lit les creds Google / Microsoft depuis AppConfig (chiffrés via
 * CryptoService) avec fallback sur les variables d'env. Cache mémoire pour
 * éviter une query DB sur chaque appel d'URL OAuth ou refresh token.
 *
 * Clés AppConfig :
 *   - integrations.google.client_id            (text, plaintext)
 *   - integrations.google.client_secret_enc    (text, AES-256-GCM)
 *   - integrations.outlook.client_id           (text, plaintext)
 *   - integrations.outlook.client_secret_enc   (text, AES-256-GCM)
 *   - integrations.outlook.tenant_id           (text, plaintext, défaut "common")
 *
 * Quand l'admin met à jour ces clés via /api/v1/admin/integrations/oauth/*,
 * `refresh()` est rappelé pour recharger le cache cluster-wide (un cycle de
 * cache par instance — acceptable, on n'a qu'une seule instance backend
 * derrière BunkerWeb pour l'instant).
 */
@Injectable()
export class OAuthCredsService implements OnModuleInit {
  private readonly logger = new Logger(OAuthCredsService.name);

  private google = { clientId: "", clientSecret: "" };
  private outlook = { clientId: "", clientSecret: "", tenantId: "common" };

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const keys = [
      "integrations.google.client_id",
      "integrations.google.client_secret_enc",
      "integrations.outlook.client_id",
      "integrations.outlook.client_secret_enc",
      "integrations.outlook.tenant_id",
    ];
    const rows = await this.prisma.appConfig.findMany({
      where: { key: { in: keys } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const decryptSafe = (enc: string | undefined): string => {
      if (!enc) return "";
      try {
        return this.crypto.decrypt(enc);
      } catch (err) {
        this.logger.warn(
          `OAuth creds decrypt failed (key rotation? corrupted ciphertext?): ${(err as Error).message}`,
        );
        return "";
      }
    };

    this.google = {
      clientId:
        map.get("integrations.google.client_id") ||
        process.env.GOOGLE_OAUTH_CLIENT_ID ||
        "",
      clientSecret:
        decryptSafe(map.get("integrations.google.client_secret_enc")) ||
        process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
        "",
    };
    this.outlook = {
      clientId:
        map.get("integrations.outlook.client_id") ||
        process.env.MICROSOFT_OAUTH_CLIENT_ID ||
        "",
      clientSecret:
        decryptSafe(map.get("integrations.outlook.client_secret_enc")) ||
        process.env.MICROSOFT_OAUTH_CLIENT_SECRET ||
        "",
      tenantId:
        map.get("integrations.outlook.tenant_id") ||
        process.env.MICROSOFT_OAUTH_TENANT_ID ||
        "common",
    };
  }

  getGoogle(): { clientId: string; clientSecret: string } {
    return { ...this.google };
  }

  getOutlook(): { clientId: string; clientSecret: string; tenantId: string } {
    return { ...this.outlook };
  }

  isGoogleConfigured(): boolean {
    return Boolean(this.google.clientId && this.google.clientSecret);
  }

  isOutlookConfigured(): boolean {
    return Boolean(this.outlook.clientId && this.outlook.clientSecret);
  }

  /**
   * Indique si la valeur courante provient de la DB (vs env). Utile à l'admin
   * UI pour afficher la source de chaque cred.
   */
  async describeSource(): Promise<{
    google: {
      clientIdSource: "db" | "env" | "none";
      hasSecret: boolean;
      secretSource: "db" | "env" | "none";
    };
    outlook: {
      clientIdSource: "db" | "env" | "none";
      hasSecret: boolean;
      secretSource: "db" | "env" | "none";
      tenantSource: "db" | "env" | "default";
      tenantId: string;
    };
  }> {
    const rows = await this.prisma.appConfig.findMany({
      where: {
        key: {
          in: [
            "integrations.google.client_id",
            "integrations.google.client_secret_enc",
            "integrations.outlook.client_id",
            "integrations.outlook.client_secret_enc",
            "integrations.outlook.tenant_id",
          ],
        },
      },
    });
    const has = (k: string) => rows.some((r) => r.key === k && r.value);

    const src = (dbKey: string, envKey: string): "db" | "env" | "none" => {
      if (has(dbKey)) return "db";
      if (process.env[envKey]) return "env";
      return "none";
    };

    return {
      google: {
        clientIdSource: src(
          "integrations.google.client_id",
          "GOOGLE_OAUTH_CLIENT_ID",
        ),
        hasSecret: this.isGoogleConfigured(),
        secretSource: src(
          "integrations.google.client_secret_enc",
          "GOOGLE_OAUTH_CLIENT_SECRET",
        ),
      },
      outlook: {
        clientIdSource: src(
          "integrations.outlook.client_id",
          "MICROSOFT_OAUTH_CLIENT_ID",
        ),
        hasSecret: this.isOutlookConfigured(),
        secretSource: src(
          "integrations.outlook.client_secret_enc",
          "MICROSOFT_OAUTH_CLIENT_SECRET",
        ),
        tenantSource: has("integrations.outlook.tenant_id")
          ? "db"
          : process.env.MICROSOFT_OAUTH_TENANT_ID
            ? "env"
            : "default",
        tenantId: this.outlook.tenantId,
      },
    };
  }
}
