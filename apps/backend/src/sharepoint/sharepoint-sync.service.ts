import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  MsAppTokenResponse,
  MsDrive,
  MsDriveItem,
  MsGraphList,
  MsSite,
  SharePointStatus,
  SharePointSyncResult,
  SyncLibraryOptions,
} from "./types";

const MS_GRAPH_API = "https://graph.microsoft.com/v1.0";

/**
 * Provider literal stocke dans `Document.externalStorageProvider` pour les
 * fichiers tires de SharePoint Online. Convention partagee avec OneDrive
 * (qui utilisera "onedrive").
 */
const PROVIDER_SHAREPOINT = "sharepoint";

/**
 * Marge de securite avant l'expiration reelle du token (50 min sur les 60
 * accordes par AAD pour client_credentials). On rafraichit en avance pour
 * eviter qu'une requete longue parte avec un token quasi-expire.
 */
const TOKEN_REFRESH_MARGIN_SEC = 10 * 60;

/**
 * Service de synchronisation SharePoint Online -> Document (intranet GED).
 *
 * Pattern aligne sur {@link OutlookSyncService} mais en App-only OAuth
 * (client_credentials flow) — pas d'OAuth utilisateur, c'est un service
 * a service. Les credentials viennent des variables d'env :
 *   - SP_TENANT_ID
 *   - SP_CLIENT_ID
 *   - SP_CLIENT_SECRET
 *
 * Toute la fonctionnalite est gatee par le flag d'env
 * `GED_SHAREPOINT_SYNC_ENABLED`. Si non actif, les methodes retournent
 * immediatement sans appeler Graph.
 *
 * Scopes requis cote app registration AAD :
 *   - Sites.Read.All
 *   - Files.Read.All
 *
 * TODO(phase 2) : webhook Graph (subscriptions) + cron periodique pour
 * remplacer les triggers manuels. Pour l'instant, seul l'endpoint manuel
 * `POST /admin/sharepoint/sync` declenche un pull.
 */
@Injectable()
export class SharePointSyncService {
  private readonly logger = new Logger(SharePointSyncService.name);

  /** Cache memoire du token d'application AAD. */
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -- Configuration / flag ------------------------------------------------

  /** Le module est-il active via le feature flag d'env ? */
  isEnabled(): boolean {
    return process.env.GED_SHAREPOINT_SYNC_ENABLED === "true";
  }

  /** Les credentials AAD App-only sont-ils tous renseignes ? */
  isConfigured(): boolean {
    return Boolean(
      process.env.SP_TENANT_ID &&
        process.env.SP_CLIENT_ID &&
        process.env.SP_CLIENT_SECRET,
    );
  }

  /** Snapshot statut pour GET /admin/sharepoint/status. */
  async getStatus(): Promise<SharePointStatus> {
    const enabled = this.isEnabled();
    const configured = this.isConfigured();

    // Derniere sync = max(externalLastSyncAt) parmi les Document SharePoint.
    let lastSyncAt: string | null = null;
    if (enabled && configured) {
      try {
        const row = await this.prisma.document.findFirst({
          where: {
            externalStorageProvider: PROVIDER_SHAREPOINT,
            externalLastSyncAt: { not: null },
          },
          orderBy: { externalLastSyncAt: "desc" },
          select: { externalLastSyncAt: true },
        });
        lastSyncAt = row?.externalLastSyncAt?.toISOString() ?? null;
      } catch (err) {
        this.logger.warn(
          `getStatus: lookup of last sync failed: ${(err as Error)?.message}`,
        );
      }
    }

    return { enabled, configured, lastSyncAt };
  }

  // -- OAuth App-only ------------------------------------------------------

  /**
   * Recupere un access_token d'application via le flow client_credentials.
   * Le token est cache en memoire et reutilise tant qu'il n'est pas a
   * moins de {@link TOKEN_REFRESH_MARGIN_SEC} de son expiration.
   *
   * Scopes : utilisation du scope "magic" `.default` qui demande tous les
   * scopes consentis pour cette app registration cote AAD.
   */
  async getAppAccessToken(): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error("SharePoint sync feature flag is disabled");
    }
    if (!this.isConfigured()) {
      throw new Error(
        "SharePoint sync not configured (SP_TENANT_ID / SP_CLIENT_ID / SP_CLIENT_SECRET missing)",
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_SEC > now) {
      return this.cachedToken.value;
    }

    const tenantId = process.env.SP_TENANT_ID!;
    const clientId = process.env.SP_CLIENT_ID!;
    const clientSecret = process.env.SP_CLIENT_SECRET!;

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    try {
      const resp = await axios.post<MsAppTokenResponse>(
        tokenUrl,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
          scope: "https://graph.microsoft.com/.default",
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10_000,
        },
      );
      const expiresInSec = resp.data.expires_in ?? 3600;
      this.cachedToken = {
        value: resp.data.access_token,
        expiresAt: now + expiresInSec,
      };
      this.logger.log(
        `SharePoint app token refreshed (expires in ${expiresInSec}s)`,
      );
      return this.cachedToken.value;
    } catch (err) {
      const e = err as AxiosError;
      const detail =
        (e.response?.data as any)?.error_description ||
        (e.response?.data as any)?.error ||
        e.message;
      this.logger.error(`SharePoint app token request failed: ${detail}`);
      throw new Error(`SharePoint app token request failed: ${detail}`);
    }
  }

  // -- Graph helpers -------------------------------------------------------

  /**
   * Liste les drives (bibliotheques documentaires) d'un site SharePoint.
   * GET /sites/{siteId}/drives.
   */
  async listSiteDrives(siteId: string): Promise<MsDrive[]> {
    if (!this.isEnabled()) return [];
    const token = await this.getAppAccessToken();
    const url = `${MS_GRAPH_API}/sites/${encodeURIComponent(siteId)}/drives`;
    try {
      const resp = await axios.get<MsGraphList<MsDrive>>(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15_000,
      });
      return resp.data.value ?? [];
    } catch (err) {
      const detail = this.extractGraphError(err);
      this.logger.warn(
        `listSiteDrives failed for site ${siteId}: ${detail}`,
      );
      throw new Error(`Graph listDrives failed: ${detail}`);
    }
  }

  /**
   * Recupere les metadonnees du site SharePoint (titre, webUrl). Optionnel,
   * utile pour les UI admin.
   */
  async getSite(siteId: string): Promise<MsSite | null> {
    if (!this.isEnabled()) return null;
    const token = await this.getAppAccessToken();
    const url = `${MS_GRAPH_API}/sites/${encodeURIComponent(siteId)}`;
    try {
      const resp = await axios.get<MsSite>(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      });
      return resp.data;
    } catch (err) {
      const detail = this.extractGraphError(err);
      this.logger.warn(`getSite failed for ${siteId}: ${detail}`);
      return null;
    }
  }

  /**
   * Liste les fichiers (driveItems) a la racine d'une bibliotheque, en
   * suivant la pagination Graph (`@odata.nextLink`).
   *
   * NOTE : 1ere passe = racine seulement. Pour traverser recursivement
   * les sous-dossiers, il faudra ajouter une exploration BFS — TODO phase 2.
   */
  async listLibraryFiles(
    _siteId: string,
    libraryId: string,
  ): Promise<MsDriveItem[]> {
    if (!this.isEnabled()) return [];
    const token = await this.getAppAccessToken();

    let url: string | undefined = `${MS_GRAPH_API}/drives/${encodeURIComponent(libraryId)}/root/children`;
    const all: MsDriveItem[] = [];
    let safetyHops = 0;

    while (url) {
      safetyHops += 1;
      if (safetyHops > 50) {
        this.logger.warn(
          `listLibraryFiles: aborting after 50 pages (drive=${libraryId})`,
        );
        break;
      }
      const nextUrl: string = url;
      try {
        const resp = await axios.get<MsGraphList<MsDriveItem>>(nextUrl, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15_000,
        });
        for (const item of resp.data.value ?? []) {
          all.push(item);
        }
        url = resp.data["@odata.nextLink"];
      } catch (err) {
        const detail = this.extractGraphError(err);
        this.logger.warn(
          `listLibraryFiles failed (drive=${libraryId}): ${detail}`,
        );
        throw new Error(`Graph listChildren failed: ${detail}`);
      }
    }

    return all;
  }

  // -- Sync ----------------------------------------------------------------

  /**
   * Mappe un driveItem Graph vers le sous-ensemble de champs Document que
   * l'on rafraichit a chaque sync. Volontairement etroit : on ne touche
   * PAS aux champs metier (title, reference, status...) qui restent
   * geres par l'application. Ici on ne met a jour que les pointeurs
   * externes + horodatage de sync.
   */
  mapDriveItemToDocument(item: MsDriveItem): {
    externalStorageProvider: string;
    externalStorageItemId: string;
    externalStorageUrl: string | null;
    externalEtag: string | null;
    externalLastSyncAt: Date;
  } {
    return {
      externalStorageProvider: PROVIDER_SHAREPOINT,
      externalStorageItemId: item.id,
      externalStorageUrl: item.webUrl ?? null,
      externalEtag: item.eTag ?? item.cTag ?? null,
      externalLastSyncAt: new Date(),
    };
  }

  /**
   * Synchronise une bibliotheque SharePoint : pour chaque driveItem,
   *  - cherche le Document local par (provider, externalStorageItemId)
   *  - si trouve, met a jour les pointeurs si l'etag a change
   *  - si non trouve, NE CREE PAS de Document (anti-pollution) : on
   *    compte juste l'item dans `unmapped` pour rapport admin.
   *
   * Les dossiers sont ignores (folder facet), on ne synchronise que les
   * fichiers (file facet). Les items marques `deleted` cote Graph sont
   * comptes dans `skipped` (cf. TODO archive automatique phase 2).
   */
  async syncLibrary(
    siteId: string,
    libraryId: string,
    opts: SyncLibraryOptions = {},
  ): Promise<SharePointSyncResult> {
    const startedAt = new Date();

    // Court-circuit si flag off : on renvoie un resultat vide structure.
    if (!this.isEnabled()) {
      return {
        siteId,
        libraryId,
        unmapped: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        total: 0,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
      };
    }
    if (!this.isConfigured()) {
      throw new Error(
        "SharePoint sync not configured (SP_TENANT_ID / SP_CLIENT_ID / SP_CLIENT_SECRET missing)",
      );
    }

    this.logger.log(
      `syncLibrary start site=${siteId} drive=${libraryId} (triggeredBy=${opts.triggeredBy ?? "system"})`,
    );

    let items: MsDriveItem[];
    try {
      items = await this.listLibraryFiles(siteId, libraryId);
    } catch (err) {
      // Audit l'echec global avant de re-throw.
      void this.audit.log({
        userId: opts.triggeredBy,
        action: "SHAREPOINT_SYNC",
        resourceType: "SharePointLibrary",
        resourceId: libraryId,
        severity: "WARN",
        metadata: {
          siteId,
          libraryId,
          error: (err as Error).message,
          status: "failed",
        },
      });
      throw err;
    }

    if (opts.maxItems && opts.maxItems > 0) {
      items = items.slice(0, opts.maxItems);
    }

    let unmapped = 0;
    let updated = 0;
    let skipped = 0;
    const errors: SharePointSyncResult["errors"] = [];

    for (const item of items) {
      // On ignore les dossiers et les tombstones.
      if (item.folder) {
        skipped += 1;
        continue;
      }
      if (item.deleted) {
        // TODO(phase 2) : marquer le Document associe comme archive
        // si la suppression SP doit se propager a l'intranet.
        skipped += 1;
        continue;
      }
      if (!item.file) {
        skipped += 1;
        continue;
      }

      try {
        const existing = await this.prisma.document.findFirst({
          where: {
            externalStorageProvider: PROVIDER_SHAREPOINT,
            externalStorageItemId: item.id,
          },
          select: { id: true, externalEtag: true },
        });

        if (!existing) {
          unmapped += 1;
          this.logger.warn(
            `syncLibrary: driveItem ${item.id} (${item.name ?? "?"}) has no matching Document — skipped (anti-pollution)`,
          );
          continue;
        }

        const newEtag = item.eTag ?? item.cTag ?? null;
        if (newEtag && existing.externalEtag === newEtag) {
          skipped += 1;
          continue;
        }

        const patch = this.mapDriveItemToDocument(item);
        await this.prisma.document.update({
          where: { id: existing.id },
          data: patch,
        });
        updated += 1;
      } catch (err) {
        const msg = (err as Error).message ?? "unknown error";
        errors.push({ itemId: item.id, message: msg });
        this.logger.warn(
          `syncLibrary: error on item ${item.id}: ${msg}`,
        );
      }
    }

    const finishedAt = new Date();
    const result: SharePointSyncResult = {
      siteId,
      libraryId,
      unmapped,
      updated,
      skipped,
      errors,
      total: items.length,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };

    this.logger.log(
      `syncLibrary done site=${siteId} drive=${libraryId} total=${result.total} updated=${result.updated} skipped=${result.skipped} unmapped=${result.unmapped} errors=${result.errors.length}`,
    );

    void this.audit.log({
      userId: opts.triggeredBy,
      action: "SHAREPOINT_SYNC",
      resourceType: "SharePointLibrary",
      resourceId: libraryId,
      severity: result.errors.length > 0 ? "WARN" : "INFO",
      metadata: {
        siteId,
        libraryId,
        counts: {
          total: result.total,
          updated: result.updated,
          skipped: result.skipped,
          unmapped: result.unmapped,
          errors: result.errors.length,
        },
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        status: "ok",
      },
    });

    return result;
  }

  // -- Util ----------------------------------------------------------------

  /**
   * Extrait un message d'erreur lisible depuis une AxiosError Graph
   * (qui encapsule un { error: { code, message } } JSON).
   */
  private extractGraphError(err: unknown): string {
    const e = err as AxiosError;
    const data = e?.response?.data as any;
    return (
      data?.error?.message || data?.error_description || e?.message || "unknown error"
    );
  }
}
