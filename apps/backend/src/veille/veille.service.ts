import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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
  { name: 'CERT-FR Alertes', url: 'https://www.cert.ssi.gouv.fr/alerte/feed/' },
  { name: 'CERT-FR Avis', url: 'https://www.cert.ssi.gouv.fr/avis/feed/' },
  { name: 'CERT-FR CTI', url: 'https://www.cert.ssi.gouv.fr/cti/feed/' },
  { name: 'ANSSI', url: 'https://cyber.gouv.fr/feed/actualites/rss.xml' },
  { name: 'CNIL', url: 'https://www.cnil.fr/fr/flux-rss' },

  // --- Autorités UE / US (conformité : NIS2, DORA, AI Act) ---
  { name: 'ENISA', url: 'https://www.enisa.europa.eu/media/news-items/news-wires/RSS' },
  { name: 'CISA Alerts', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml' },
  { name: 'EDPB', url: 'https://edpb.europa.eu/news/news_en/rss.xml' },

  // --- CVE / Patch management (ISO 27001 A.8.8) ---
  { name: 'CVE Feed', url: 'https://cvefeed.io/rssfeed/latest.xml' },

  // --- Presse cybersécurité entreprise ---
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
  { name: 'SANS ISC', url: 'https://isc.sans.edu/rssfeed.xml' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },

  // --- Sécurité physique / vidéosurveillance / contrôle d'accès ---
  { name: 'IFSEC Insider', url: 'https://www.ifsecglobal.com/feed/' },
  { name: 'Security Magazine', url: 'https://www.securitymagazine.com/rss/topic/2236-cyber-security-news' },

  // --- IA / conformité AI Act ---
  { name: 'NIST Cybersecurity', url: 'https://www.nist.gov/news-events/cybersecurity/rss.xml' },

  // --- PSIRT constructeurs (parc OMNITECH — priorisation patch management) ---
  { name: 'Fortinet PSIRT', url: 'https://www.fortiguard.com/rss/psirt.xml' },
  { name: 'Microsoft MSRC', url: 'https://msrc.microsoft.com/blog/feed' },
  { name: 'VMware Security', url: 'https://www.vmware.com/security/advisories.xml' },
  { name: 'Aruba (HPE) Security', url: 'https://www.arubanetworks.com/support-services/security-bulletins/feed/' },
  { name: 'Cisco Security', url: 'https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml' },
  { name: 'Veeam KB', url: 'https://www.veeam.com/blog/feed/' },
  { name: 'HPE Security', url: 'https://support.hpe.com/hpsc/rss/servicenotifications?category=security' },

  // --- Hypervision / NVR / contrôle d'accès (produits OMNITECH Security) ---
  { name: 'Genetec Security', url: 'https://www.genetec.com/feed/news' },
  { name: 'Milestone XProtect', url: 'https://www.milestonesys.com/feed/' },
];

// Mots-clés supplémentaires pour taguer/prioriser la veille selon les sujets
// OMNITECH (vidéosurveillance, NIS2, IA, contrôle d'accès…). Utilisés dans
// l'analyse de pertinence (VeilleItem.description) pour flaguer la sévérité
// lorsqu'un produit/sujet du parc est mentionné.
const OMNITECH_TOPICS = [
  // Réglementaire
  'nis2', 'nis 2', 'dora', 'rgpd', 'gdpr', 'ai act', 'ia act',
  // Sécurité physique + hypervision
  'vidéosurveillance', 'videosurveillance', 'cctv', 'caméra ip', 'camera ip',
  'contrôle d\'accès', 'controle d\'acces', 'badge', 'biométrie', 'biometrie',
  'intrusion', 'alarme', 'hypervision', 'nvr', 'vms',
  'genetec', 'milestone', 'xprotect', 'synergis',
  // IA / cybersec IA
  'intelligence artificielle', 'llm', 'chatbot', 'deepfake', 'prompt injection',
  'ai security', 'adversarial', 'model poisoning',
  // Infra réseau / PSIRT (produits parc — doublon avec OMNITECH_PRODUCTS mais
  // facilite le match quand le titre mentionne juste "Aruba ClearPass" sans
  // "aruba" en tag explicite)
  'aruba', 'clearpass', 'instant on', 'hpe',
];

// Parc OMNITECH — produits à surveiller (ISO 27001 A.5.7)
const OMNITECH_PRODUCTS = [
  // Firewall / VPN
  'fortigate', 'fortinet', 'forticlient', 'fortios', 'fortianalyzer', 'fortimail', 'fortiweb',
  // Virtualisation
  'vmware', 'vsphere', 'esxi', 'vcenter', 'nsx', 'horizon',
  // Endpoint / antivirus
  'eset', 'nod32', 'sophos', 'defender', 'crowdstrike', 'sentinelone',
  // Microsoft
  'windows', 'microsoft', 'exchange', 'office 365', 'azure', 'intune', 'active directory',
  // Backup
  'veeam', 'veeam b&r', 'acronis',
  // Hardware / switch / wifi
  'dell', 'hp ', 'hpe', 'aruba', 'clearpass',
  'cisco', 'meraki', 'catalyst',
  // Sécurité physique / vidéosurveillance / hypervision
  'genetec', 'security center', 'synergis',
  'milestone', 'xprotect', 'husky',
  'hikvision', 'dahua', 'axis camera',
  'bosch', 'avigilon',
  // Contrôle d'accès (cartes, lecteurs)
  'hid', 'mifare', 'desfire',
  // Infra backend
  'postgresql', 'redis', 'nginx', 'node.js', 'nodejs', 'docker', 'kubernetes',
];

@Injectable()
export class VeilleService {
  private readonly logger = new Logger(VeilleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

    if (filters.isProcessed !== undefined) where.isProcessed = filters.isProcessed;
    if (filters.dateFrom) {
      where.publishedAt = { gte: new Date(filters.dateFrom) };
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { cveId: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.veilleItem.findMany({
        where,
        include: {
          acks: {
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.veilleItem.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async acknowledge(veilleItemId: string, userId: string, action: string, comment?: string) {
    const item = await this.prisma.veilleItem.findUnique({ where: { id: veilleItemId } });
    if (!item) throw new NotFoundException('Veille item not found');

    const ack = await this.prisma.veilleAck.upsert({
      where: { veilleItemId_userId: { veilleItemId, userId } },
      create: { veilleItemId, userId, action, comment },
      update: { action, comment, createdAt: new Date() },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    // Mark as processed if action is definitive
    if (['APPLIED', 'NOT_APPLICABLE', 'RISK_ACCEPTED'].includes(action)) {
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
  async bulkProcessAll(userId: string) {
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

    this.logger.log(`Bulk process: ${updated.count} items marked processed, ${purged.count} items purged (>90 days)`);
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
    const [total, unprocessed, processed, bySeverity, bySource, lastItem] = await Promise.all([
      this.prisma.veilleItem.count(),
      this.prisma.veilleItem.count({ where: { isProcessed: false } }),
      this.prisma.veilleItem.count({ where: { isProcessed: true } }),
      this.prisma.veilleItem.groupBy({
        by: ['severity'],
        _count: true,
        where: { isProcessed: false },
      }),
      this.prisma.veilleItem.groupBy({
        by: ['sourceName'],
        _count: true,
      }),
      this.prisma.veilleItem.findFirst({
        orderBy: { publishedAt: 'desc' },
        select: { publishedAt: true },
      }),
    ]);
    return {
      total, unprocessed, processed,
      bySeverity: bySeverity.reduce<Record<string, number>>((a, b) => ({ ...a, [b.severity || 'unknown']: b._count }), {}),
      bySource: bySource.reduce<Record<string, number>>((a, b) => ({ ...a, [b.sourceName]: b._count }), {}),
      lastCollect: lastItem?.publishedAt?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // VeilleSource CRUD
  // ---------------------------------------------------------------------------

  async getSources() {
    return this.prisma.veilleSource.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async createSource(data: { name: string; url: string }) {
    try {
      return await this.prisma.veilleSource.create({ data });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Une source avec cette URL existe déjà');
      throw err;
    }
  }

  async updateSource(id: string, data: { name?: string; url?: string; isActive?: boolean }) {
    const existing = await this.prisma.veilleSource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Source non trouvée');
    return this.prisma.veilleSource.update({ where: { id }, data });
  }

  async deleteSource(id: string) {
    const existing = await this.prisma.veilleSource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Source non trouvée');
    await this.prisma.veilleSource.delete({ where: { id } });
    return { message: 'Source supprimée' };
  }

  /**
   * Seed the VeilleSource table with the default hardcoded feeds.
   * Safe to call multiple times — skips existing URLs.
   */
  async seedDefaultSources(): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;
    for (const feed of RSS_FEEDS) {
      const exists = await this.prisma.veilleSource.findUnique({ where: { url: feed.url } });
      if (exists) { skipped++; continue; }
      await this.prisma.veilleSource.create({ data: { name: feed.name, url: feed.url } });
      inserted++;
    }
    this.logger.log(`seedDefaultSources: ${inserted} inserted, ${skipped} skipped`);
    return { inserted, skipped };
  }

  @Cron(CronExpression.EVERY_2_HOURS)
  async fetchRSSFeeds() {
    this.logger.log('Fetching RSS feeds for veille...');
    let total = 0;

    // Resolve feeds: active DB sources, or fall back to hardcoded list if table is empty
    let feeds: Array<{ name: string; url: string }>;
    try {
      const dbSources = await this.prisma.veilleSource.findMany({ where: { isActive: true } });
      feeds = dbSources.length > 0 ? dbSources : RSS_FEEDS;
    } catch {
      feeds = RSS_FEEDS;
    }

    for (const feed of feeds) {
      try {
        const items = await this.parseRSSFeed(feed.url, feed.name);
        for (const item of items) {
          try {
            await this.prisma.veilleItem.upsert({
              where: { sourceUrl: item.link },
              create: {
                title: item.title,
                description: item.description?.substring(0, 2000) || null,
                sourceUrl: item.link,
                sourceName: item.source,
                publishedAt: new Date(item.pubDate || Date.now()),
                severity: this.detectSeverity(item.title + ' ' + (item.description || '')),
                cveId: this.extractCVE(item.title + ' ' + (item.description || '')),
              },
              update: {},
            });
            total++;
          } catch {
            // Skip duplicates silently
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to fetch ${feed.name}: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.logger.log(`Veille: ${total} items processed`);
  }

  private async parseRSSFeed(url: string, sourceName: string): Promise<RSSItem[]> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const xml = await response.text();
      const items: RSSItem[] = [];

      // Simple XML parsing without dependencies
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const itemXml = match[1] || '';
        const title = this.extractTag(itemXml, 'title');
        const link = this.extractTag(itemXml, 'link');
        const description = this.extractTag(itemXml, 'description');
        const pubDate = this.extractTag(itemXml, 'pubDate');

        if (title && link) {
          items.push({ title, description, link, pubDate, source: sourceName });
        }
      }

      return items.slice(0, 50);
    } catch {
      return [];
    }
  }

  private extractTag(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
    const match = regex.exec(xml);
    return (match?.[1] || match?.[2] || '').trim().replace(/<[^>]+>/g, '');
  }

  private detectSeverity(text: string): string {
    const t = text.toLowerCase();
    if (t.includes('critique') || t.includes('critical') || t.includes('urgente')) return 'CRITICAL';
    if (t.includes('important') || t.includes('haute') || t.includes('high')) return 'HIGH';
    if (t.includes('moyenne') || t.includes('medium') || t.includes('moderate')) return 'MEDIUM';
    return 'LOW';
  }

  private extractCVE(text: string): string | null {
    const match = /CVE-\d{4}-\d{4,}/i.exec(text);
    return match ? match[0].toUpperCase() : null;
  }

  /**
   * Check if a veille item concerns a product in OMNITECH's parc OR a topic
   * directly pertinent pour l'activité d'OMNITECH (sécurité physique, NIS2,
   * vidéosurveillance, IA, conformité RGPD/AI Act…).
   */
  isRelevantToParc(text: string): boolean {
    const t = text.toLowerCase();
    return (
      OMNITECH_PRODUCTS.some((p) => t.includes(p)) ||
      OMNITECH_TOPICS.some((topic) => t.includes(topic))
    );
  }

  // --- Weekly Bulletin ---

  @Cron('0 8 * * 1') // Every Monday 8:00 AM
  async generateWeeklyBulletinCron() {
    this.logger.log('Generating weekly cybersecurity bulletin...');
    try {
      await this.generateWeeklyBulletin();
    } catch (err) {
      this.logger.error(`Failed to generate weekly bulletin: ${err instanceof Error ? err.message : err}`);
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
      orderBy: { publishedAt: 'desc' },
    });

    // Filter relevant to OMNITECH parc
    const relevant = items.filter(item =>
      this.isRelevantToParc((item.title || '') + ' ' + (item.description || ''))
    );

    // Group by severity
    const bySeverity = {
      CRITICAL: relevant.filter(i => i.severity === 'CRITICAL'),
      HIGH: relevant.filter(i => i.severity === 'HIGH'),
      MEDIUM: relevant.filter(i => i.severity === 'MEDIUM'),
      LOW: relevant.filter(i => i.severity === 'LOW'),
    };

    // Generate HTML
    const content = this.generateBulletinHtml(start, end, bySeverity, relevant.length);

    const title = `Bulletin Cybersécurité — Semaine du ${start.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')}`;

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
        where: { id: { in: relevant.map(i => i.id) } },
        data: { bulletinId: bulletin.id },
      });
    }

    // Notify all ADMIN/SUPER_ADMIN users
    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      await this.notificationsService.create({
        userId: admin.id,
        type: 'DOC_PUBLISHED',
        title: 'Bulletin cybersécurité hebdomadaire',
        body: `${relevant.length} alertes pertinentes cette semaine.`,
        resourceType: 'VeilleBulletin',
      });
    }

    this.logger.log(`Weekly bulletin generated: ${relevant.length} relevant items out of ${items.length} total`);
    return bulletin;
  }

  async getBulletins(page = 1, limit = 12) {
    const [data, total] = await Promise.all([
      this.prisma.veilleBulletin.findMany({
        where: { isPublished: true },
        orderBy: { weekStart: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.veilleBulletin.count({ where: { isPublished: true } }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getBulletinById(id: string) {
    const bulletin = await this.prisma.veilleBulletin.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { publishedAt: 'desc' },
          include: { acks: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
        },
      },
    });
    if (!bulletin) throw new NotFoundException('Bulletin not found');
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
    top5Critical: Array<{ id: string; title: string; severity: string; cveId: string | null; sourceName: string; publishedAt: string; sourceUrl: string }>;
    productsAffected: string[];
  }> {
    const weekStart = this.getCurrentMonday();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const items = await this.prisma.veilleItem.findMany({
      where: { publishedAt: { gte: weekStart, lt: weekEnd } },
      orderBy: [{ severity: 'asc' }, { publishedAt: 'desc' }],
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

    const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const item of items) {
      const sev = item.severity || 'LOW';
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    }

    const criticalItems = items.filter(i => i.severity === 'CRITICAL');
    const top5Critical = criticalItems.slice(0, 5).map(i => ({
      id: i.id,
      title: i.title,
      severity: i.severity || 'LOW',
      cveId: i.cveId,
      sourceName: i.sourceName,
      publishedAt: i.publishedAt.toISOString(),
      sourceUrl: i.sourceUrl,
    }));

    // Collect products mentioned in this week's items
    const productsFound = new Set<string>();
    for (const item of items) {
      const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
      for (const product of OMNITECH_PRODUCTS) {
        if (text.includes(product.toLowerCase())) {
          // Normalise to a display-friendly name
          const display =
            product === 'fortigate' || product === 'fortinet' || product === 'forticlient' || product === 'fortios' ? 'Fortinet/FortiGate' :
            product === 'vmware' || product === 'vsphere' || product === 'esxi' || product === 'vcenter' ? 'VMware/vSphere' :
            product === 'eset' || product === 'nod32' ? 'ESET' :
            product === 'windows' || product === 'microsoft' || product === 'exchange' || product === 'office 365' || product === 'azure' ? 'Microsoft' :
            product === 'veeam' ? 'Veeam' :
            product === 'dell' ? 'Dell' :
            product === 'hp ' || product === 'hpe' ? 'HPE/Dell' :
            product === 'cisco' || product === 'meraki' ? 'Cisco/Meraki' :
            product === 'sophos' ? 'Sophos' :
            product === 'acronis' ? 'Acronis' :
            product === 'postgresql' ? 'PostgreSQL' :
            product === 'redis' ? 'Redis' :
            product === 'nginx' ? 'Nginx' :
            product === 'node.js' || product === 'nodejs' ? 'Node.js' :
            product;
          productsFound.add(display);
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
    const dateRange = `${start.toLocaleDateString('fr-FR')} — ${end.toLocaleDateString('fr-FR')}`;

    const renderSection = (title: string, emoji: string, items: any[]) => {
      if (items.length === 0) return '';
      return `
      <div style="margin-bottom:24px;">
        <h2 style="color:#004469;border-bottom:2px solid #F68D2E;padding-bottom:6px;">${emoji} ${title} (${items.length})</h2>
        <ul style="list-style:none;padding:0;">
          ${items.map(item => `
            <li style="padding:8px 12px;margin:6px 0;background:#f8f9fa;border-left:4px solid ${
              item.severity === 'CRITICAL' ? '#dc2626' :
              item.severity === 'HIGH' ? '#f59e0b' :
              item.severity === 'MEDIUM' ? '#3b82f6' : '#6b7280'
            };border-radius:4px;">
              <strong>${this.escapeHtml(item.title)}</strong>
              ${item.cveId ? `<span style="background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:3px;font-size:11px;margin-left:8px;">${item.cveId}</span>` : ''}
              <br/><span style="font-size:12px;color:#666;">${item.sourceName} — ${new Date(item.publishedAt).toLocaleDateString('fr-FR')}</span>
              ${item.description ? `<br/><span style="font-size:12px;color:#444;">${this.escapeHtml((item.description || '').substring(0, 200))}</span>` : ''}
              <br/><a href="${item.sourceUrl}" style="font-size:11px;color:#F68D2E;">Voir le détail →</a>
            </li>
          `).join('')}
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
        ${renderSection('Alertes CRITIQUES', '🔴', bySeverity.CRITICAL)}
        ${renderSection('Alertes HAUTES', '🟠', bySeverity.HIGH)}
        ${renderSection('Alertes MOYENNES', '🔵', bySeverity.MEDIUM)}
        ${renderSection('Alertes BASSES', '⚪', bySeverity.LOW)}
        ${totalCount === 0 ? '<p style="text-align:center;color:#6b7280;padding:20px;">Aucune alerte pertinente pour le parc OMNITECH cette semaine.</p>' : ''}
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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Get items relevant to OMNITECH parc only
   */
  async getRelevantItems(limit = 20) {
    const all = await this.prisma.veilleItem.findMany({
      where: { isProcessed: false },
      orderBy: { publishedAt: 'desc' },
      take: 200,
    });

    return all
      .filter(item => this.isRelevantToParc((item.title || '') + ' ' + (item.description || '')))
      .slice(0, limit);
  }
}
