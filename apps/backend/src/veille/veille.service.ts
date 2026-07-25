import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
}

// Sources RSS sélectionnées pour couvrir l'ensemble du périmètre d'OMNITECH
// Security (intégrateur sécurité physique + cyber + conformité + IA) :
//   - Cyber : CERT-FR, ANSSI, CISA, CVE, presse
//   - Conformité : NIS2, DORA, RGPD (EDPB, CNIL)
//   - Sécurité physique : videosurveillance, contrôle d'accès
//   - IA : AI Act, ENISA AI security, NIST AI RMF
// L'ordre compte : autorités d'abord, puis presse spécialisée métier.
const RSS_FEEDS = [
  // --- Autorités FR (ANSSI, CNIL) ---
  { name: "CERT-FR Alertes", url: "https://www.cert.ssi.gouv.fr/alerte/feed/" },
  { name: "CERT-FR Avis", url: "https://www.cert.ssi.gouv.fr/avis/feed/" },
  { name: "CERT-FR CTI", url: "https://www.cert.ssi.gouv.fr/cti/feed/" },
  { name: "ANSSI", url: "https://cyber.gouv.fr/actualites/rss/" },
  { name: "CNIL", url: "https://www.cnil.fr/fr/flux-rss" },

  // --- Autorités UE / US (conformité : NIS2, DORA, AI Act) ---
  {
    name: "ENISA",
    url: "https://www.enisa.europa.eu/media/news-items/news-wires/RSS",
  },
  {
    name: "CISA Alerts",
    url: "https://www.cisa.gov/cybersecurity-advisories/all.xml",
  },
  { name: "EDPB", url: "https://edpb.europa.eu/news/news_en/rss.xml" },

  // --- CVE / Patch management (ISO 27001 A.8.8) ---
  { name: "CVE Feed", url: "https://cvefeed.io/rssfeed/latest.xml" },

  // --- Presse cybersécurité entreprise ---
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/" },
  { name: "SANS ISC", url: "https://isc.sans.edu/rssfeed.xml" },
  {
    name: "The Hacker News",
    url: "https://feeds.feedburner.com/TheHackersNews",
  },

  // --- Sécurité physique / vidéosurveillance / contrôle d'accès ---
  { name: "IFSEC Insider", url: "https://www.ifsecglobal.com/feed/" },
  {
    name: "Security Magazine",
    url: "https://www.securitymagazine.com/rss/topic/2236-cyber-security-news",
  },

  // --- IA / conformité AI Act ---
  {
    name: "NIST Cybersecurity",
    url: "https://www.nist.gov/news-events/cybersecurity/rss.xml",
  },

  // --- PSIRT constructeurs (parc OMNITECH — priorisation patch management) ---
  { name: "Fortinet PSIRT", url: "https://www.fortiguard.com/rss/psirt.xml" },
  { name: "Microsoft MSRC", url: "https://msrc.microsoft.com/blog/feed" },
  {
    name: "VMware Security",
    url: "https://www.vmware.com/security/advisories.xml",
  },
  {
    name: "Aruba (HPE) Security",
    url: "https://www.arubanetworks.com/support-services/security-bulletins/feed/",
  },
  {
    name: "Cisco Security",
    url: "https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml",
  },
  { name: "Veeam KB", url: "https://www.veeam.com/blog/feed/" },
  {
    name: "HPE Security",
    url: "https://support.hpe.com/hpsc/rss/servicenotifications?category=security",
  },

  // --- Hypervision / NVR / contrôle d'accès (produits OMNITECH Security) ---
  { name: "Genetec Security", url: "https://www.genetec.com/feed/news" },
  { name: "Milestone XProtect", url: "https://www.milestonesys.com/feed/" },
];

// ---------------------------------------------------------------------------
// Pertinence parc — listes DURCIES (2026-07-24, remédiation spam notifications)
// ---------------------------------------------------------------------------
// RÈGLE : uniquement des noms de PRODUITS/SUJETS précis et non ambigus.
// Les termes génériques utilisés auparavant (« windows », « microsoft »,
// « hp  », « dell », « docker », « llm », « badge », « defender » seuls…)
// matchaient la quasi-totalité de la presse cyber et ont produit jusqu'à
// 60 notifications/jour/admin en juillet 2026. Ils sont INTERDITS ici.
// Le match se fait par frontière de mot (containsToken) pour éviter les
// faux positifs par sous-chaîne (ex. « eset » ⊂ « reset », « hid » ⊂ « hidden »).

// Parc OMNITECH — correspondance STRICTE (ISO 27001 A.5.7).
// Utilisée par le canal de notification immédiat : chaque entrée doit
// désigner un produit précis effectivement déployé chez OMNITECH.
const OMNITECH_PARC_STRICT = [
  // Firewall / VPN Fortinet
  "fortigate",
  "fortios",
  "forticlient",
  "fortianalyzer",
  "fortimail",
  "fortiweb",
  "fortinet",
  // Virtualisation VMware
  "vmware",
  "vsphere",
  "esxi",
  "vcenter",
  // Endpoint / antivirus (produits, jamais « defender » seul)
  "eset",
  "nod32",
  "sophos",
  "crowdstrike",
  "sentinelone",
  "microsoft defender",
  "windows defender",
  // Microsoft — produits précis, jamais « windows »/« microsoft »/« azure » seuls
  "microsoft exchange",
  "exchange server",
  "office 365",
  "microsoft 365",
  "windows server",
  "active directory",
  "entra id",
  "intune",
  // Backup
  "veeam",
  "acronis",
  // Réseau / wifi (marques d'équipements réseau du parc)
  "aruba clearpass",
  "clearpass",
  "aruba instant on",
  "cisco",
  "meraki",
  "catalyst",
  // Sécurité physique / vidéosurveillance / hypervision (métier OMNITECH)
  "genetec",
  "security center",
  "synergis",
  "milestone",
  "xprotect",
  "hikvision",
  "dahua",
  "axis camera",
  "avigilon",
  // Contrôle d'accès (cartes, lecteurs — jamais « hid » seul : ⊂ « hidden »)
  "hid global",
  "mifare",
  "desfire",
  // Infra backend intranet
  "postgresql",
  "redis",
  "nginx",
  "node.js",
  "nodejs",
];

// Sujets métier OMNITECH (réglementaire, sécurité physique, sécurité IA) —
// utilisés en COMPLÉMENT du parc pour la pertinence « large » (bulletin
// hebdo, liste /veille/relevant), jamais pour le canal immédiat.
const OMNITECH_TOPICS = [
  // Réglementaire (précis)
  "nis2",
  "nis 2",
  "dora",
  "rgpd",
  "gdpr",
  "ai act",
  "ia act",
  // Sécurité physique / hypervision (cœur de métier)
  "vidéosurveillance",
  "videosurveillance",
  "cctv",
  "caméra ip",
  "camera ip",
  "contrôle d'accès",
  "controle d'acces",
  "biométrie",
  "biometrie",
  "hypervision",
  "nvr",
  // Sécurité IA — sujets précis uniquement (« llm »/« chatbot » seuls bannis)
  "prompt injection",
  "deepfake",
  "model poisoning",
];

/**
 * Match par frontière de mot (insensible à la casse). Contrairement à un
 * simple `String.includes`, « eset » ne matche pas « reset » et « nvr » ne
 * matche pas un mot qui le contiendrait. Les tokens multi-mots («·office
 * 365·», « axis camera ») fonctionnent tels quels.
 */
function containsToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

/**
 * Normalise un titre pour la déduplication (même annonce via deux flux de la
 * même source avec une ponctuation/casse différente).
 */
function normalizeTitle(title: string): string {
  return (title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents (combining diacritics)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Extrait un score CVSS mentionné dans le texte (« CVSS 9.8 »,
 * « CVSS:3.1/... 9.1 », « score CVSS de 9,8 »…). Renvoie null si absent
 * ou invraisemblable (> 10).
 */
function extractCvssScore(lowerText: string): number | null {
  const m = /cvss[^0-9]{0,20}(\d{1,2}(?:[.,]\d)?)/.exec(lowerText);
  if (!m || !m[1]) return null;
  const score = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(score) || score > 10) return null;
  return score;
}

/**
 * Clé AppConfig du kill-switch des notifications veille.
 * Défaut : DÉSACTIVÉ (fail-closed anti-spam) — l'ingestion RSS continue
 * quel que soit l'état, seule l'émission de notifications est conditionnée.
 */
export const VEILLE_NOTIFICATIONS_ENABLED_KEY = "veille.notifications.enabled";

/** Item CRITICAL nouvellement ingéré, candidat au canal immédiat. */
interface NewCriticalItem {
  id: string;
  title: string;
  description: string | null;
  sourceName: string;
  cveId: string | null;
}

@Injectable()
export class VeilleService {
  private readonly logger = new Logger(VeilleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Kill-switch notifications (AppConfig veille.notifications.enabled)
  // ---------------------------------------------------------------------------

  /**
   * Les notifications veille sont-elles activées ? Défaut : NON.
   * Seule la valeur exacte "true" active l'émission (fail-closed).
   */
  async areNotificationsEnabled(): Promise<boolean> {
    try {
      const cfg = await this.prisma.appConfig.findUnique({
        where: { key: VEILLE_NOTIFICATIONS_ENABLED_KEY },
      });
      return cfg?.value === "true";
    } catch {
      return false;
    }
  }

  async getNotificationsConfig(): Promise<{ enabled: boolean; key: string }> {
    return {
      enabled: await this.areNotificationsEnabled(),
      key: VEILLE_NOTIFICATIONS_ENABLED_KEY,
    };
  }

  async setNotificationsEnabled(
    enabled: boolean,
    updatedById?: string,
  ): Promise<{ enabled: boolean }> {
    await this.prisma.appConfig.upsert({
      where: { key: VEILLE_NOTIFICATIONS_ENABLED_KEY },
      update: { value: String(enabled), updatedById, updatedAt: new Date() },
      create: {
        key: VEILLE_NOTIFICATIONS_ENABLED_KEY,
        value: String(enabled),
        description:
          "Kill-switch des notifications du module veille (alertes critiques + bulletins). " +
          "L'ingestion RSS continue quel que soit l'état. Défaut : false.",
        updatedById,
      },
    });
    this.logger.warn(
      `Notifications veille ${enabled ? "ACTIVÉES" : "DÉSACTIVÉES"} (par ${updatedById || "system"})`,
    );
    return { enabled };
  }

  async findAll(filters: {
    isProcessed?: boolean;
    page?: number;
    limit?: number;
    search?: string;
    dateFrom?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 30;
    const where: any = {};

    if (filters.isProcessed !== undefined)
      where.isProcessed = filters.isProcessed;
    if (filters.dateFrom) {
      where.publishedAt = { gte: new Date(filters.dateFrom) };
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
        { cveId: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.veilleItem.findMany({
        where,
        include: {
          acks: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.veilleItem.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async acknowledge(
    veilleItemId: string,
    userId: string,
    action: string,
    comment?: string,
  ) {
    const item = await this.prisma.veilleItem.findUnique({
      where: { id: veilleItemId },
    });
    if (!item) throw new NotFoundException("Veille item not found");

    const ack = await this.prisma.veilleAck.upsert({
      where: { veilleItemId_userId: { veilleItemId, userId } },
      create: { veilleItemId, userId, action, comment },
      update: { action, comment, createdAt: new Date() },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Mark as processed if action is definitive
    if (["APPLIED", "NOT_APPLICABLE", "RISK_ACCEPTED"].includes(action)) {
      await this.prisma.veilleItem.update({
        where: { id: veilleItemId },
        data: { isProcessed: true },
      });
    }

    return ack;
  }

  /**
   * Bulk mark ALL unprocessed items as processed (acknowledged)
   * Also purge items older than 90 days to prevent infinite growth
   */
  async bulkProcessAll(_userId: string) {
    const updated = await this.prisma.veilleItem.updateMany({
      where: { isProcessed: false },
      data: { isProcessed: true },
    });

    // Purge items older than 90 days (keep only recent ones)
    const cutoff = new Date(Date.now() - 90 * 86400000);
    const purged = await this.prisma.veilleItem.deleteMany({
      where: {
        isProcessed: true,
        publishedAt: { lt: cutoff },
      },
    });

    this.logger.log(
      `Bulk process: ${updated.count} items marked processed, ${purged.count} items purged (>90 days)`,
    );
    return { processed: updated.count, purged: purged.count };
  }

  async getStats(): Promise<{
    total: number;
    unprocessed: number;
    processed: number;
    bySeverity: Record<string, number>;
    bySource: Record<string, number>;
    lastCollect: string | null;
  }> {
    const [total, unprocessed, processed, bySeverity, bySource, lastItem] =
      await Promise.all([
        this.prisma.veilleItem.count(),
        this.prisma.veilleItem.count({ where: { isProcessed: false } }),
        this.prisma.veilleItem.count({ where: { isProcessed: true } }),
        this.prisma.veilleItem.groupBy({
          by: ["severity"],
          _count: true,
          where: { isProcessed: false },
        }),
        this.prisma.veilleItem.groupBy({
          by: ["sourceName"],
          _count: true,
        }),
        this.prisma.veilleItem.findFirst({
          orderBy: { publishedAt: "desc" },
          select: { publishedAt: true },
        }),
      ]);
    return {
      total,
      unprocessed,
      processed,
      bySeverity: bySeverity.reduce<Record<string, number>>(
        (a, b) => ({ ...a, [b.severity || "unknown"]: b._count }),
        {},
      ),
      bySource: bySource.reduce<Record<string, number>>(
        (a, b) => ({ ...a, [b.sourceName]: b._count }),
        {},
      ),
      lastCollect: lastItem?.publishedAt?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // VeilleSource CRUD
  // ---------------------------------------------------------------------------

  async getSources() {
    return this.prisma.veilleSource.findMany({ orderBy: { createdAt: "asc" } });
  }

  async createSource(data: { name: string; url: string }) {
    try {
      return await this.prisma.veilleSource.create({ data });
    } catch (err: any) {
      if (err?.code === "P2002")
        throw new ConflictException("Une source avec cette URL existe déjà");
      throw err;
    }
  }

  async updateSource(
    id: string,
    data: { name?: string; url?: string; isActive?: boolean },
  ) {
    const existing = await this.prisma.veilleSource.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Source non trouvée");
    return this.prisma.veilleSource.update({ where: { id }, data });
  }

  async deleteSource(id: string) {
    const existing = await this.prisma.veilleSource.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Source non trouvée");
    await this.prisma.veilleSource.delete({ where: { id } });
    return { message: "Source supprimée" };
  }

  /**
   * Seed the VeilleSource table with the default hardcoded feeds.
   * Safe to call multiple times — skips existing URLs.
   */
  async seedDefaultSources(): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;
    for (const feed of RSS_FEEDS) {
      const exists = await this.prisma.veilleSource.findUnique({
        where: { url: feed.url },
      });
      if (exists) {
        skipped++;
        continue;
      }
      await this.prisma.veilleSource.create({
        data: { name: feed.name, url: feed.url },
      });
      inserted++;
    }
    this.logger.log(
      `seedDefaultSources: ${inserted} inserted, ${skipped} skipped`,
    );
    return { inserted, skipped };
  }

  @Cron(CronExpression.EVERY_2_HOURS)
  async fetchRSSFeeds() {
    this.logger.log("Fetching RSS feeds for veille...");
    let total = 0;

    // Resolve feeds: active DB sources, or fall back to hardcoded list if table is empty
    let feeds: Array<{ name: string; url: string }>;
    try {
      const dbSources = await this.prisma.veilleSource.findMany({
        where: { isActive: true },
      });
      feeds = dbSources.length > 0 ? dbSources : RSS_FEEDS;
    } catch {
      feeds = RSS_FEEDS;
    }

    // Per-feed stats for observability: which feed is silently broken?
    const feedStats: Array<{
      feed: string;
      fetched: number;
      upserted: number;
      error?: string;
    }> = [];

    // Items CRITICAL nouvellement créés → candidats au canal immédiat
    // (filtrage strict dans notifyImmediateCriticals, le reste part dans
    // le digest quotidien de 8h).
    const newCriticalItems: NewCriticalItem[] = [];

    for (const feed of feeds) {
      const stat = { feed: feed.name, fetched: 0, upserted: 0 } as {
        feed: string;
        fetched: number;
        upserted: number;
        error?: string;
      };
      try {
        const items = await this.parseRSSFeed(feed.url, feed.name);
        stat.fetched = items.length;
        for (const item of items) {
          try {
            const existing = await this.prisma.veilleItem.findUnique({
              where: { sourceUrl: item.link },
            });
            if (existing) continue; // déjà ingéré

            const severity = this.detectSeverity(
              item.title + " " + (item.description || ""),
            );
            const cveId = this.extractCVE(
              item.title + " " + (item.description || ""),
            );
            const created = await this.prisma.veilleItem.create({
              data: {
                title: item.title,
                description: item.description?.substring(0, 2000) || null,
                sourceUrl: item.link,
                sourceName: item.source,
                publishedAt: new Date(item.pubDate || Date.now()),
                severity,
                cveId,
              },
            });
            stat.upserted++;
            total++;

            // ISO 27001 A.5.7 — candidats au canal immédiat. Le filtrage
            // (kill-switch, CVE non nul, parc STRICT, dédup 30 j) est fait
            // en fin de cycle par notifyImmediateCriticals.
            if (severity === "CRITICAL") {
              newCriticalItems.push({
                id: created.id,
                title: created.title,
                description: created.description,
                sourceName: created.sourceName,
                cveId: created.cveId,
              });
            }
          } catch (err: any) {
            // P2002 = collision de course (créé par un autre worker), on ignore.
            if (err?.code !== "P2002") {
              this.logger.warn(
                `Create error for ${feed.name} (${item.link}): ${err?.message || err}`,
              );
            }
          }
        }
      } catch (err) {
        stat.error = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to fetch ${feed.name}: ${stat.error}`);
      }
      feedStats.push(stat);
    }

    // Canal immédiat — strictement filtré (le gros du signal passe par le
    // digest quotidien de 8h, cf. sendDailyCriticalDigest).
    if (newCriticalItems.length > 0) {
      try {
        await this.notifyImmediateCriticals(newCriticalItems);
      } catch (err) {
        this.logger.error(
          `Failed to notify admins of critical veille items: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // Log structured summary (fed pas cassé reste isolable a posteriori)
    const failed = feedStats.filter((s) => s.error || s.fetched === 0);
    if (failed.length > 0) {
      this.logger.warn(
        `Veille: ${failed.length}/${feeds.length} sources vides ou en erreur: ${failed.map((f) => f.feed).join(", ")}`,
      );
    }
    this.logger.log(
      `Veille: ${total} items processed sur ${feeds.length} sources`,
    );
  }

  /**
   * Canal de notification IMMÉDIAT (entre deux digests quotidiens) —
   * volontairement TRÈS restrictif pour éliminer le spam :
   *  1. kill-switch AppConfig `veille.notifications.enabled` (défaut OFF) ;
   *  2. sévérité CRITICAL (garantie par l'appelant) ;
   *  3. cveId NON NUL (une alerte sans CVE attend le digest) ;
   *  4. correspondance STRICTE avec le parc (OMNITECH_PARC_STRICT — produits
   *     précis, pas de « windows »/« microsoft » seuls) ;
   *  5. dédup ingestion : un VeilleItem des 30 derniers jours avec le même
   *     CVE (ou même titre normalisé + même source) → skip la notification
   *     (l'item reste créé pour l'historique) ;
   *  6. dédup notification : NotificationsService.create avec
   *     dedupeKey=CVE (fenêtre 7 jours par utilisateur).
   * Plus de cap silencieux slice(0,5) : tout item passant ces filtres est
   * notifié (le filtrage strict garantit un volume très faible).
   */
  private async notifyImmediateCriticals(
    items: NewCriticalItem[],
  ): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      this.logger.debug(
        `Veille: notifications désactivées (${VEILLE_NOTIFICATIONS_ENABLED_KEY}=false) — ${items.length} item(s) CRITICAL non notifié(s), disponibles dans le digest si réactivation`,
      );
      return;
    }

    const toNotify: NewCriticalItem[] = [];
    for (const item of items) {
      if (!item.cveId) continue;
      const text = item.title + " " + (item.description || "");
      if (!this.isStrictParcMatch(text)) continue;
      if (await this.hasRecentDuplicate(item)) {
        this.logger.debug(
          `Veille: notification skippée (doublon <30j) pour ${item.cveId} — ${item.title.substring(0, 80)}`,
        );
        continue;
      }
      toNotify.push(item);
    }
    if (toNotify.length === 0) return;

    const admins = await this.prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      for (const crit of toNotify) {
        await this.notificationsService.create({
          userId: admin.id,
          type: "VEILLE_CRITICAL",
          title: `Veille CRITIQUE — ${crit.cveId}`,
          body: `${crit.sourceName} : ${crit.title.substring(0, 180)}`,
          resourceType: "VeilleItem",
          resourceId: crit.id,
          // Fenêtre anti-doublon 7 j par utilisateur (même CVE via une
          // autre source/URL → une seule notification).
          dedupeKey: crit.cveId ?? undefined,
        });
      }
    }
    this.logger.warn(
      `Veille: ${toNotify.length} alerte(s) CRITIQUE(S) parc strict notifiée(s) immédiatement à ${admins.length} admin(s) (sur ${items.length} candidat(s))`,
    );
  }

  /**
   * Dédup à l'ingestion : existe-t-il déjà un VeilleItem des 30 derniers
   * jours portant le même CVE, ou le même titre normalisé venant de la même
   * source ? (Le même CVE revient souvent via plusieurs flux/URLs — la
   * contrainte unique sourceUrl ne suffit pas.)
   */
  private async hasRecentDuplicate(item: {
    id: string;
    title: string;
    sourceName: string;
    cveId: string | null;
  }): Promise<boolean> {
    const since = new Date(Date.now() - 30 * 86400000);
    if (item.cveId) {
      const dupByCve = await this.prisma.veilleItem.findFirst({
        where: {
          id: { not: item.id },
          cveId: item.cveId,
          fetchedAt: { gte: since },
        },
        select: { id: true },
      });
      if (dupByCve) return true;
    }
    const siblings = await this.prisma.veilleItem.findMany({
      where: {
        id: { not: item.id },
        sourceName: item.sourceName,
        fetchedAt: { gte: since },
      },
      select: { title: true },
      orderBy: { fetchedAt: "desc" },
      take: 200,
    });
    const norm = normalizeTitle(item.title);
    return siblings.some((s) => normalizeTitle(s.title) === norm);
  }

  /**
   * DIGEST QUOTIDIEN de veille — remplace le fil continu de notifications
   * par item (cron 2h) supprimé le 2026-07-24.
   *
   * Tous les jours ouvrés à 8h : agrège les items CRITICAL pertinents parc
   * des dernières 24h (72h le lundi pour couvrir le week-end) et émet UNE
   * seule notification VEILLE_CRITICAL de synthèse par admin.
   * Gardé par le kill-switch `veille.notifications.enabled`.
   */
  @Cron("0 8 * * 1-5")
  async sendDailyCriticalDigestCron() {
    try {
      await this.sendDailyCriticalDigest();
    } catch (err) {
      this.logger.error(
        `Veille daily digest failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async sendDailyCriticalDigest(
    now: Date = new Date(),
  ): Promise<{ notified: number; items: number }> {
    if (!(await this.areNotificationsEnabled())) {
      this.logger.debug(
        `Veille: digest quotidien skippé (${VEILLE_NOTIFICATIONS_ENABLED_KEY}=false)`,
      );
      return { notified: 0, items: 0 };
    }

    // 72h le lundi (couvre le week-end sans cron sam/dim), 24h sinon.
    const windowHours = now.getDay() === 1 ? 72 : 24;
    const since = new Date(now.getTime() - windowHours * 3600000);

    const criticals = await this.prisma.veilleItem.findMany({
      where: { severity: "CRITICAL", fetchedAt: { gte: since } },
      select: {
        id: true,
        title: true,
        description: true,
        cveId: true,
        sourceName: true,
      },
      orderBy: { fetchedAt: "desc" },
    });

    // Pertinence « large » (parc strict + sujets métier) puis dédup par CVE
    // (ou titre normalisé) pour ne compter chaque alerte qu'une fois.
    const seen = new Set<string>();
    const relevant = criticals.filter((i) => {
      const text = (i.title || "") + " " + (i.description || "");
      if (!this.isRelevantToParc(text)) return false;
      const key = i.cveId || normalizeTitle(i.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (relevant.length === 0) {
      this.logger.log(
        `Veille digest: aucune alerte critique pertinente sur ${windowHours}h — aucune notification`,
      );
      return { notified: 0, items: 0 };
    }

    const parcCveCount = relevant.filter(
      (i) =>
        i.cveId &&
        this.isStrictParcMatch((i.title || "") + " " + (i.description || "")),
    ).length;

    const top = relevant
      .slice(0, 3)
      .map((i) => `• ${i.cveId ? `${i.cveId} — ` : ""}${i.title.substring(0, 120)}`)
      .join("\n");
    const rest =
      relevant.length > 3 ? `\n… et ${relevant.length - 3} autre(s).` : "";

    const admins = await this.prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
      select: { id: true },
    });
    let notified = 0;
    for (const admin of admins) {
      await this.notificationsService.create({
        userId: admin.id,
        type: "VEILLE_CRITICAL",
        title: `Veille : ${relevant.length} alerte${relevant.length > 1 ? "s" : ""} critique${relevant.length > 1 ? "s" : ""} dont ${parcCveCount} CVE parc`,
        body: `${top}${rest}`,
        resourceType: "VeilleItem",
      });
      notified++;
    }
    this.logger.log(
      `Veille digest: ${relevant.length} alerte(s) critique(s) (${parcCveCount} CVE parc) → 1 notification de synthèse pour ${notified} admin(s)`,
    );
    return { notified, items: relevant.length };
  }

  private async parseRSSFeed(
    url: string,
    sourceName: string,
  ): Promise<RSSItem[]> {
    // Le `fetchRSSFeeds` catche par-source : on laisse remonter l'erreur
    // pour qu'elle soit loggée avec le nom du flux (diagnostic).
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent":
          "OmnitechVeille/1.0 (+https://intranet.omnitech-security.fr)",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const xml = await response.text();
    const items: RSSItem[] = [];

    // Simple XML parsing without dependencies
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1] || "";
      const title = this.extractTag(itemXml, "title");
      const link = this.extractTag(itemXml, "link");
      const description = this.extractTag(itemXml, "description");
      const pubDate = this.extractTag(itemXml, "pubDate");

      if (title && link) {
        items.push({ title, description, link, pubDate, source: sourceName });
      }
    }

    // Fallback : si le flux utilise <entry> (Atom) et pas <item>, tenter ce format
    if (items.length === 0) {
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let entryMatch;
      while ((entryMatch = entryRegex.exec(xml)) !== null) {
        const entryXml = entryMatch[1] || "";
        const title = this.extractTag(entryXml, "title");
        // Atom: <link href="..."/>
        const linkMatch = /<link[^>]*href="([^"]+)"/.exec(entryXml);
        const link = linkMatch?.[1] || this.extractTag(entryXml, "id");
        const description =
          this.extractTag(entryXml, "summary") ||
          this.extractTag(entryXml, "content");
        const pubDate =
          this.extractTag(entryXml, "updated") ||
          this.extractTag(entryXml, "published");
        if (title && link) {
          items.push({ title, description, link, pubDate, source: sourceName });
        }
      }
    }

    return items.slice(0, 50);
  }

  private extractTag(xml: string, tag: string): string {
    const regex = new RegExp(
      `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    );
    const match = regex.exec(xml);
    return (match?.[1] || match?.[2] || "").trim().replace(/<[^>]+>/g, "");
  }

  /**
   * Détection de sévérité DURCIE (2026-07-24).
   *
   * Avant : « critical »/« critique » n'importe où dans le texte → CRITICAL,
   * ce qui classait CRITICAL ~8 % de toute la presse cyber (1 058 items) et
   * alimentait le spam de notifications.
   *
   * Désormais CRITICAL exige un CVE ET un signal fort :
   *  - exploitation active (« exploited in the wild », « actively exploited »,
   *    « activement exploité », KEV) ou zero-day/0-day ;
   *  - OU un score CVSS ≥ 9 détecté dans le texte.
   * Un simple mot-clé « critical »/« critique » classe l'item HIGH au mieux.
   */
  detectSeverity(text: string): string {
    const t = text.toLowerCase();
    const hasCve = /cve-\d{4}-\d{4,}/i.test(text);
    const activelyExploited =
      /exploited in the wild|actively exploited|activement exploit|exploitation active|known exploited|zero[- ]?day|\b0[- ]?day\b/.test(
        t,
      );
    const cvss = extractCvssScore(t);

    if (hasCve && (activelyExploited || (cvss !== null && cvss >= 9)))
      return "CRITICAL";

    const criticalWords = /\b(critical|critique|urgent|urgente)\b/.test(t);
    if (
      criticalWords ||
      (cvss !== null && cvss >= 7) ||
      /\b(important|importante|haute|high)\b/.test(t)
    )
      return "HIGH";
    if (/\b(moyenne|medium|moderate)\b/.test(t)) return "MEDIUM";
    return "LOW";
  }

  private extractCVE(text: string): string | null {
    const match = /CVE-\d{4}-\d{4,}/i.exec(text);
    return match ? match[0].toUpperCase() : null;
  }

  /**
   * Pertinence « large » : produit du parc STRICT ou sujet métier OMNITECH
   * (sécurité physique, NIS2, sécurité IA…). Utilisée pour le bulletin
   * hebdo, /veille/relevant et le digest quotidien. Les tokens génériques
   * historiques (« windows », « microsoft », « docker », « llm »…) ont été
   * retirés — voir OMNITECH_PARC_STRICT / OMNITECH_TOPICS.
   */
  isRelevantToParc(text: string): boolean {
    return (
      this.isStrictParcMatch(text) ||
      OMNITECH_TOPICS.some((topic) => containsToken(text, topic))
    );
  }

  /**
   * Correspondance STRICTE avec le parc : uniquement les produits précis de
   * OMNITECH_PARC_STRICT, avec frontières de mot. C'est le seul critère de
   * pertinence accepté par le canal de notification immédiat.
   */
  isStrictParcMatch(text: string): boolean {
    return OMNITECH_PARC_STRICT.some((p) => containsToken(text, p));
  }

  // --- Weekly Bulletin ---

  @Cron("0 8 * * 1") // Every Monday 8:00 AM
  async generateWeeklyBulletinCron() {
    this.logger.log("Generating weekly cybersecurity bulletin...");
    try {
      await this.generateWeeklyBulletin();
    } catch (err) {
      this.logger.error(
        `Failed to generate weekly bulletin: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async generateWeeklyBulletin(weekStart?: Date): Promise<any> {
    const start = weekStart || this.getCurrentMonday();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    // Check if bulletin already exists for this week
    const existing = await this.prisma.veilleBulletin.findUnique({
      where: { weekStart: start },
    });
    if (existing) return existing;

    // Get all items from the week
    const items = await this.prisma.veilleItem.findMany({
      where: {
        publishedAt: { gte: start, lt: end },
      },
      orderBy: { publishedAt: "desc" },
    });

    // Filter relevant to OMNITECH parc
    const relevant = items.filter((item) =>
      this.isRelevantToParc(
        (item.title || "") + " " + (item.description || ""),
      ),
    );

    // Group by severity
    const bySeverity = {
      CRITICAL: relevant.filter((i) => i.severity === "CRITICAL"),
      HIGH: relevant.filter((i) => i.severity === "HIGH"),
      MEDIUM: relevant.filter((i) => i.severity === "MEDIUM"),
      LOW: relevant.filter((i) => i.severity === "LOW"),
    };

    // Generate HTML
    const content = this.generateBulletinHtml(
      start,
      end,
      bySeverity,
      relevant.length,
    );

    const title = `Bulletin Cybersécurité — Semaine du ${start.toLocaleDateString("fr-FR")} au ${end.toLocaleDateString("fr-FR")}`;

    const bulletin = await this.prisma.veilleBulletin.create({
      data: {
        title,
        weekStart: start,
        weekEnd: end,
        content,
        itemCount: relevant.length,
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    // Link items to bulletin
    if (relevant.length > 0) {
      await this.prisma.veilleItem.updateMany({
        where: { id: { in: relevant.map((i) => i.id) } },
        data: { bulletinId: bulletin.id },
      });
    }

    // Notification ADMIN/SUPER_ADMIN — type dédié VEILLE_BULLETIN, gardée
    // par le kill-switch (le bulletin est créé dans tous les cas).
    if (await this.areNotificationsEnabled()) {
      const admins = await this.prisma.user.findMany({
        where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
        select: { id: true },
      });
      for (const admin of admins) {
        await this.notificationsService.create({
          userId: admin.id,
          type: "VEILLE_BULLETIN",
          title: "Bulletin cybersécurité hebdomadaire",
          body: `${relevant.length} alertes pertinentes cette semaine.`,
          resourceType: "VeilleBulletin",
          resourceId: bulletin.id,
        });
      }
    } else {
      this.logger.debug(
        `Veille: notification bulletin skippée (${VEILLE_NOTIFICATIONS_ENABLED_KEY}=false)`,
      );
    }

    this.logger.log(
      `Weekly bulletin generated: ${relevant.length} relevant items out of ${items.length} total`,
    );
    return bulletin;
  }

  async getBulletins(page = 1, limit = 12) {
    const [data, total] = await Promise.all([
      this.prisma.veilleBulletin.findMany({
        where: { isPublished: true },
        orderBy: { weekStart: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.veilleBulletin.count({ where: { isPublished: true } }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getBulletinById(id: string) {
    const bulletin = await this.prisma.veilleBulletin.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { publishedAt: "desc" },
          include: {
            acks: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    if (!bulletin) throw new NotFoundException("Bulletin not found");
    return bulletin;
  }

  private getLastMonday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff - 7); // Last Monday
    return d;
  }

  private getCurrentMonday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff); // Current week Monday
    return d;
  }

  async getWeeklySummary(): Promise<{
    weekStart: string;
    weekEnd: string;
    total: number;
    bySeverity: Record<string, number>;
    top5Critical: Array<{
      id: string;
      title: string;
      severity: string;
      cveId: string | null;
      sourceName: string;
      publishedAt: string;
      sourceUrl: string;
    }>;
    productsAffected: string[];
  }> {
    const weekStart = this.getCurrentMonday();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const items = await this.prisma.veilleItem.findMany({
      where: { publishedAt: { gte: weekStart, lt: weekEnd } },
      orderBy: [{ severity: "asc" }, { publishedAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        severity: true,
        cveId: true,
        sourceName: true,
        publishedAt: true,
        sourceUrl: true,
      },
    });

    const bySeverity: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const item of items) {
      const sev = item.severity || "LOW";
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    }

    const criticalItems = items.filter((i) => i.severity === "CRITICAL");
    const top5Critical = criticalItems.slice(0, 5).map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity || "LOW",
      cveId: i.cveId,
      sourceName: i.sourceName,
      publishedAt: i.publishedAt.toISOString(),
      sourceUrl: i.sourceUrl,
    }));

    // Collect products mentioned in this week's items (parc strict only)
    const PRODUCT_DISPLAY: Record<string, string> = {
      fortigate: "Fortinet/FortiGate",
      fortios: "Fortinet/FortiGate",
      forticlient: "Fortinet/FortiGate",
      fortianalyzer: "Fortinet/FortiGate",
      fortimail: "Fortinet/FortiGate",
      fortiweb: "Fortinet/FortiGate",
      fortinet: "Fortinet/FortiGate",
      vmware: "VMware/vSphere",
      vsphere: "VMware/vSphere",
      esxi: "VMware/vSphere",
      vcenter: "VMware/vSphere",
      eset: "ESET",
      nod32: "ESET",
      "microsoft defender": "Microsoft",
      "windows defender": "Microsoft",
      "microsoft exchange": "Microsoft",
      "exchange server": "Microsoft",
      "office 365": "Microsoft",
      "microsoft 365": "Microsoft",
      "windows server": "Microsoft",
      "active directory": "Microsoft",
      "entra id": "Microsoft",
      intune: "Microsoft",
      veeam: "Veeam",
      acronis: "Acronis",
      "aruba clearpass": "Aruba/ClearPass",
      clearpass: "Aruba/ClearPass",
      "aruba instant on": "Aruba/ClearPass",
      cisco: "Cisco/Meraki",
      meraki: "Cisco/Meraki",
      catalyst: "Cisco/Meraki",
      sophos: "Sophos",
      crowdstrike: "CrowdStrike",
      sentinelone: "SentinelOne",
      postgresql: "PostgreSQL",
      redis: "Redis",
      nginx: "Nginx",
      "node.js": "Node.js",
      nodejs: "Node.js",
    };
    const productsFound = new Set<string>();
    for (const item of items) {
      const text = (item.title || "") + " " + (item.description || "");
      for (const product of OMNITECH_PARC_STRICT) {
        if (containsToken(text, product)) {
          productsFound.add(PRODUCT_DISPLAY[product] || product);
        }
      }
    }

    return {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      total: items.length,
      bySeverity,
      top5Critical,
      productsAffected: Array.from(productsFound).sort(),
    };
  }

  private generateBulletinHtml(
    start: Date,
    end: Date,
    bySeverity: Record<string, any[]>,
    totalCount: number,
  ): string {
    const dateRange = `${start.toLocaleDateString("fr-FR")} — ${end.toLocaleDateString("fr-FR")}`;

    const renderSection = (title: string, emoji: string, items: any[]) => {
      if (items.length === 0) return "";
      return `
      <div style="margin-bottom:24px;">
        <h2 style="color:#004469;border-bottom:2px solid #F68D2E;padding-bottom:6px;">${emoji} ${title} (${items.length})</h2>
        <ul style="list-style:none;padding:0;">
          ${items
            .map(
              (item) => `
            <li style="padding:8px 12px;margin:6px 0;background:#f8f9fa;border-left:4px solid ${
              item.severity === "CRITICAL"
                ? "#dc2626"
                : item.severity === "HIGH"
                  ? "#f59e0b"
                  : item.severity === "MEDIUM"
                    ? "#3b82f6"
                    : "#6b7280"
            };border-radius:4px;">
              <strong>${this.escapeHtml(item.title)}</strong>
              ${item.cveId ? `<span style="background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:3px;font-size:11px;margin-left:8px;">${item.cveId}</span>` : ""}
              <br/><span style="font-size:12px;color:#666;">${item.sourceName} — ${new Date(item.publishedAt).toLocaleDateString("fr-FR")}</span>
              ${item.description ? `<br/><span style="font-size:12px;color:#444;">${this.escapeHtml((item.description || "").substring(0, 200))}</span>` : ""}
              <br/><a href="${item.sourceUrl}" style="font-size:11px;color:#F68D2E;">Voir le détail →</a>
            </li>
          `,
            )
            .join("")}
        </ul>
      </div>
    `;
    };

    return `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
      <div style="background:#004469;color:white;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:20px;">🛡️ Bulletin Cybersécurité OMNITECH</h1>
        <p style="margin:4px 0 0;opacity:0.7;font-size:13px;">${dateRange} — ${totalCount} alertes pertinentes pour le parc</p>
        <p style="margin:4px 0 0;opacity:0.5;font-size:11px;">ISO 27001:2022 — A.5.7 Threat intelligence</p>
      </div>
      <div style="padding:20px 24px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
          <strong>Produits surveillés :</strong> FortiGate/FortiOS, VMware/vSphere/ESXi, ESET, Microsoft/Windows/Exchange/Azure, Veeam, Dell/HPE, Cisco/Meraki, Sophos, Acronis, PostgreSQL, Redis, Nginx, Node.js
        </div>
        ${renderSection("Alertes CRITIQUES", "🔴", bySeverity.CRITICAL)}
        ${renderSection("Alertes HAUTES", "🟠", bySeverity.HIGH)}
        ${renderSection("Alertes MOYENNES", "🔵", bySeverity.MEDIUM)}
        ${renderSection("Alertes BASSES", "⚪", bySeverity.LOW)}
        ${totalCount === 0 ? '<p style="text-align:center;color:#6b7280;padding:20px;">Aucune alerte pertinente pour le parc OMNITECH cette semaine.</p>' : ""}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="font-size:11px;color:#9ca3af;text-align:center;">
          Généré automatiquement par l'intranet OMNITECH Security<br/>
          Sources : CERT-FR (alertes + avis), ANSSI<br/>
          Filtrage automatique sur le parc technique OMNITECH
        </p>
      </div>
    </div>
  `;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Get items relevant to OMNITECH parc only
   */
  async getRelevantItems(limit = 20) {
    const all = await this.prisma.veilleItem.findMany({
      where: { isProcessed: false },
      orderBy: { publishedAt: "desc" },
      take: 200,
    });

    return all
      .filter((item) =>
        this.isRelevantToParc(
          (item.title || "") + " " + (item.description || ""),
        ),
      )
      .slice(0, limit);
  }
}
