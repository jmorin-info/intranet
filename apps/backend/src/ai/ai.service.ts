import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, ROLE_HIERARCHY } from '../common/enums';

// ---------------------------------------------------------------------------
// French stop-words used by tokenizer
// ---------------------------------------------------------------------------
const FR_STOP_WORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'au', 'aux',
  'ce', 'ces', 'ou', 'par', 'pour', 'pas', 'que', 'qui', 'sur', 'son', 'sa',
  'ses', 'se', 'ne', 'ni', 'il', 'elle', 'nous', 'vous', 'ils', 'elles',
  'est', 'sont', 'dans', 'avec', 'plus', 'mais', 'tout', 'tous', 'comme',
  'cette', 'leur', 'leurs', 'bien', 'fait', 'peut', 'ont', 'dit', 'aussi',
  'car', 'entre', 'vers', 'chez', 'sans', 'sous', 'donc', 'lors', 'si',
  'nos', 'vos', 'mes', 'tes', 'mon', 'ton', 'peu', 'trop', 'tre', 'ici',
]);

// ---------------------------------------------------------------------------
// Keyword maps for analyzeTicket
// ---------------------------------------------------------------------------
const HIGH_PRIORITY_KEYWORDS = [
  'urgent', 'critique', 'bloquant', 'production', 'panne', 'indisponible',
  'hors service', 'crash', 'down', 'security', 'fuite', 'breach', 'ransomware',
  'compromis', 'intrusion', 'malware', 'ddos', 'phishing',
];

const MEDIUM_PRIORITY_KEYWORDS = [
  'lent', 'erreur', 'bug', 'dysfonctionnement', 'probleme', 'defaillance',
  'intermittent', 'performance', 'timeout', 'echec', 'impossible',
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  SECURITE: ['virus', 'malware', 'phishing', 'firewall', 'vpn', 'mot de passe', 'password', 'ransomware', 'intrusion', 'fuite', 'compromis'],
  RESEAU: ['reseau', 'network', 'wifi', 'dns', 'dhcp', 'ip', 'switch', 'routeur', 'latence', 'debit', 'connexion'],
  MATERIEL: ['ecran', 'clavier', 'souris', 'imprimante', 'pc', 'laptop', 'portable', 'batterie', 'chargeur', 'casque'],
  LOGICIEL: ['logiciel', 'application', 'mise a jour', 'update', 'licence', 'installation', 'office', 'teams', 'outlook'],
  ACCES: ['acces', 'permission', 'droit', 'compte', 'login', 'authentification', 'badge', 'session'],
};

const CONTENT_CATEGORIES: Record<string, string[]> = {
  POLICY: ['politique', 'policy', 'directive', 'reglement', 'gouvernance', 'charte', 'cadre', 'norme'],
  PROCEDURE: ['procedure', 'processus', 'workflow', 'etape', 'instructions', 'mode operatoire', 'methode'],
  GUIDE: ['guide', 'tutoriel', 'howto', 'comment', 'bonnes pratiques', 'recommandation', 'conseil'],
  REPORT: ['rapport', 'report', 'bilan', 'analyse', 'synthese', 'audit', 'revue', 'resultat'],
  PLAN: ['plan', 'planification', 'roadmap', 'strategie', 'objectif', 'programme', 'planning'],
  RECORD: ['enregistrement', 'trace', 'evidence', 'preuve', 'log', 'journal', 'historique'],
  FORM: ['formulaire', 'form', 'template', 'modele', 'fiche', 'demande', 'requete'],
  CONTRACT: ['contrat', 'contract', 'accord', 'convention', 'engagement', 'sla', 'nda'],
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Multi-source TF-IDF search across documents, wiki, tickets, news,
   * runbooks, veille, KB.
   */
  async smartSearch(query: string, userId: string, userRole?: UserRole) {
    const tokens = this.tokenize(query);
    if (tokens.length === 0) {
      return { documents: [], wiki: [], tickets: [], news: [], runbooks: [], veille: [], kb: [], suggestions: [] };
    }

    const [documents, wiki, tickets, news, runbooks, veille, kb] = await Promise.all([
      this.searchDocuments(tokens, userId, userRole),
      this.searchWiki(tokens),
      this.searchTickets(tokens),
      this.searchNews(tokens),
      this.searchRunbooks(tokens),
      this.searchVeille(tokens),
      this.searchKB(tokens),
    ]);

    const allTitles = [
      ...documents.map((d) => d.title),
      ...wiki.map((w) => w.title),
      ...tickets.map((t) => t.title),
      ...news.map((n) => n.title),
      ...runbooks.map((r) => r.title),
    ];

    const suggestions = this.computeDidYouMean(query, allTitles);

    return { documents, wiki, tickets, news, runbooks, veille, kb, suggestions };
  }

  /**
   * Keyword-based priority/risk detection for a new ticket.
   */
  analyzeTicket(title: string, description: string, category: string) {
    const text = `${title} ${description} ${category}`.toLowerCase();

    // Priority detection
    let suggestedPriority = 'MEDIUM';
    const highMatch = HIGH_PRIORITY_KEYWORDS.find((kw) => text.includes(kw));
    if (highMatch) {
      suggestedPriority = 'HIGH';
    }
    const criticalSignals = HIGH_PRIORITY_KEYWORDS.filter((kw) => text.includes(kw));
    if (criticalSignals.length >= 3) {
      suggestedPriority = 'CRITICAL';
    }
    if (!highMatch) {
      const medMatch = MEDIUM_PRIORITY_KEYWORDS.find((kw) => text.includes(kw));
      if (!medMatch) {
        suggestedPriority = 'LOW';
      }
    }

    // Category suggestion
    let suggestedCategory = category || 'OTHER';
    let bestCategoryScore = 0;
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score > bestCategoryScore) {
        bestCategoryScore = score;
        suggestedCategory = cat;
      }
    }

    // Risk flags
    const riskFlags: string[] = [];
    if (text.includes('production')) riskFlags.push('Impact production');
    if (text.includes('securite') || text.includes('security')) riskFlags.push('Risque securite');
    if (text.includes('donnees') || text.includes('data')) riskFlags.push('Donnees sensibles');
    if (text.includes('fuite') || text.includes('breach')) riskFlags.push('Fuite potentielle');
    if (text.includes('rgpd') || text.includes('gdpr') || text.includes('cnil')) riskFlags.push('Impact RGPD');

    return {
      suggestedPriority,
      suggestedCategory,
      riskFlags,
      confidence: highMatch ? 0.85 : 0.6,
      analysis: `Analyse basee sur ${criticalSignals.length} indicateur(s) de criticite et ${bestCategoryScore} indicateur(s) de categorie.`,
    };
  }

  /**
   * Personalized recommendations based on department, recent docs, wiki etc.
   */
  async getRecommendations(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true, role: true, firstName: true },
    });

    if (!user) return { greeting: '', documents: [], wiki: [], actions: [] };

    const greeting = this.getSmartGreeting(user.firstName);

    // Department-specific recent documents
    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: 'APPROVED',
        ...(user.departmentId ? { owner: { departmentId: user.departmentId } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, reference: true, category: true, updatedAt: true },
    }).catch((err) => {
      this.logger.warn(`getRecommendations documents: ${err?.message}`);
      return [];
    });

    // Recent wiki pages
    const wiki = await this.prisma.wikiPage.findMany({
      where: { isPublished: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, slug: true, category: true, updatedAt: true },
    }).catch((err) => {
      this.logger.warn(`getRecommendations wiki: ${err?.message}`);
      return [];
    });

    // Actionable items
    const actions: Array<{ type: string; label: string; link?: string }> = [];

    // Unsigned chartes
    const unsignedChartes = await this.prisma.charte.findMany({
      where: {
        isActive: true,
        isMandatory: true,
        signatures: { none: { userId } },
      },
      select: { id: true, title: true },
    }).catch((err) => {
      this.logger.warn(`getRecommendations unsignedChartes: ${err?.message}`);
      return [];
    });
    for (const c of unsignedChartes) {
      actions.push({ type: 'CHARTE', label: `Signer la charte : ${c.title}`, link: `/chartes/${c.id}` });
    }

    // Unread notifications count
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    }).catch((err) => {
      this.logger.warn(`getRecommendations unreadCount: ${err?.message}`);
      return 0;
    });
    if (unreadCount > 0) {
      actions.push({ type: 'NOTIFICATION', label: `${unreadCount} notification(s) non lue(s)`, link: '/notifications' });
    }

    return { greeting, documents, wiki, actions };
  }

  /**
   * Auto-categorize document content based on keyword analysis.
   */
  categorizeContent(text: string) {
    const lower = text.toLowerCase();
    const scores: Array<{ category: string; score: number; keywords: string[] }> = [];

    for (const [category, keywords] of Object.entries(CONTENT_CATEGORIES)) {
      const matched = keywords.filter((kw) => lower.includes(kw));
      if (matched.length > 0) {
        scores.push({ category, score: matched.length, keywords: matched });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    return {
      suggestedCategory: best?.category || 'OTHER',
      confidence: best ? Math.min(best.score / 3, 1) : 0,
      matchedKeywords: best?.keywords || [],
      alternatives: scores.slice(1, 4).map((s) => ({ category: s.category, score: s.score })),
    };
  }

  /**
   * UX insights: personalized suggestions based on usage patterns.
   */
  async generateUxInsights(userId: string, userRole?: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        avatarUrl: true,
        phone: true,
        jobTitle: true,
        location: true,
        skills: true,
        languages: true,
        departmentId: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) return { profileScore: 0, tips: [], achievements: [] };

    const tips: Array<{ type: string; message: string; link?: string; priority: number }> = [];
    const achievements: Array<{ icon: string; label: string }> = [];

    // -----------------------------------------------------------------------
    // 1. Profile completeness score
    // -----------------------------------------------------------------------
    const profileFields = [
      user.firstName, user.lastName, user.email, user.avatarUrl,
      user.phone, user.jobTitle, user.location, user.skills, user.languages,
    ];
    const filledCount = profileFields.filter(Boolean).length;
    const profileScore = Math.round((filledCount / profileFields.length) * 100);

    if (profileScore < 100) {
      const missing: string[] = [];
      if (!user.avatarUrl) missing.push('photo de profil');
      if (!user.phone) missing.push('telephone');
      if (!user.jobTitle) missing.push('poste');
      if (!user.location) missing.push('localisation');
      if (!user.skills) missing.push('competences');
      if (!user.languages) missing.push('langues');
      tips.push({
        type: 'PROFILE',
        message: `Completez votre profil (${profileScore}%) : ajoutez ${missing.slice(0, 3).join(', ')}`,
        link: '/profile',
        priority: 1,
      });
    }

    // -----------------------------------------------------------------------
    // 2. Unsigned chartes
    // -----------------------------------------------------------------------
    const unsignedChartes = await this.prisma.charte.count({
      where: {
        isActive: true,
        isMandatory: true,
        signatures: { none: { userId } },
      },
    }).catch((err) => {
      this.logger.warn(`generateUxInsights unsignedChartes: ${err?.message}`);
      return 0;
    });

    if (unsignedChartes > 0) {
      tips.push({
        type: 'COMPLIANCE',
        message: `${unsignedChartes} charte(s) obligatoire(s) en attente de signature`,
        link: '/chartes',
        priority: 0,
      });
    }

    // -----------------------------------------------------------------------
    // 3. Unread notifications
    // -----------------------------------------------------------------------
    const unreadNotifs = await this.prisma.notification.count({
      where: { userId, isRead: false },
    }).catch((err) => {
      this.logger.warn(`generateUxInsights unreadNotifs: ${err?.message}`);
      return 0;
    });

    if (unreadNotifs > 5) {
      tips.push({
        type: 'NOTIFICATION',
        message: `Vous avez ${unreadNotifs} notifications non lues`,
        link: '/notifications',
        priority: 2,
      });
    }

    // -----------------------------------------------------------------------
    // 4. New user tips (account < 7 days)
    // -----------------------------------------------------------------------
    const accountAge = Date.now() - new Date(user.createdAt).getTime();
    const isNewUser = accountAge < 7 * 24 * 60 * 60 * 1000;

    if (isNewUser) {
      tips.push(
        { type: 'ONBOARDING', message: 'Decouvrez le wiki interne pour les guides et procedures', link: '/wiki', priority: 3 },
        { type: 'ONBOARDING', message: 'Consultez les actualites de l\'entreprise', link: '/news', priority: 3 },
        { type: 'ONBOARDING', message: 'Familiarisez-vous avec le systeme de tickets IT', link: '/tickets', priority: 3 },
      );
    }

    // -----------------------------------------------------------------------
    // 5. Achievements
    // -----------------------------------------------------------------------
    const docsOwned = await this.prisma.document.count({
      where: { ownerId: userId, deletedAt: null },
    }).catch((err) => {
      this.logger.warn(`generateUxInsights docsOwned: ${err?.message}`);
      return 0;
    });
    if (docsOwned >= 10) achievements.push({ icon: 'file-text', label: 'Auteur prolifique (10+ documents)' });
    if (docsOwned >= 1) achievements.push({ icon: 'file-plus', label: 'Premier document cree' });

    const wikiPages = await this.prisma.wikiPage.count({
      where: { authorId: userId },
    }).catch((err) => {
      this.logger.warn(`generateUxInsights wikiPages: ${err?.message}`);
      return 0;
    });
    if (wikiPages >= 5) achievements.push({ icon: 'book-open', label: 'Contributeur wiki (5+ pages)' });
    if (wikiPages >= 1) achievements.push({ icon: 'book', label: 'Premiere page wiki' });

    const ticketsResolved = await this.prisma.ticket.count({
      where: { assigneeId: userId, status: 'RESOLVED' },
    }).catch((err) => {
      this.logger.warn(`generateUxInsights ticketsResolved: ${err?.message}`);
      return 0;
    });
    if (ticketsResolved >= 20) achievements.push({ icon: 'check-circle', label: 'Expert support (20+ tickets resolus)' });

    // -----------------------------------------------------------------------
    // 6. Admin-specific insights
    // -----------------------------------------------------------------------
    const role = userRole || (user.role as UserRole);
    if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.ADMIN]) {
      const pendingApproval = await this.prisma.document.count({
        where: { status: 'PENDING_APPROVAL', deletedAt: null },
      }).catch((err) => {
        this.logger.warn(`generateUxInsights pendingApproval: ${err?.message}`);
        return 0;
      });

      if (pendingApproval > 0) {
        tips.push({
          type: 'ADMIN',
          message: `${pendingApproval} document(s) en attente d'approbation`,
          link: '/documents?status=PENDING_APPROVAL',
          priority: 1,
        });
      }

      const overdueCompliance = await this.prisma.complianceTask.count({
        where: { status: 'OVERDUE' },
      }).catch((err) => {
        this.logger.warn(`generateUxInsights overdueCompliance: ${err?.message}`);
        return 0;
      });

      if (overdueCompliance > 0) {
        tips.push({
          type: 'ADMIN',
          message: `${overdueCompliance} tache(s) de conformite en retard`,
          link: '/compliance',
          priority: 0,
        });
      }
    }

    // Sort tips by priority (lower = more important)
    tips.sort((a, b) => a.priority - b.priority);

    return { profileScore, tips, achievements, greeting: this.getSmartGreeting(user.firstName) };
  }

  // =========================================================================
  // SEARCH METHODS (private)
  // =========================================================================

  /**
   * Search documents with ISO 27001 A.5.12 classification-based filtering.
   */
  private async searchDocuments(tokens: string[], userId: string, userRole?: UserRole) {
    const docs = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: { in: ['APPROVED', 'IN_REVIEW', 'PENDING_APPROVAL'] },
        OR: tokens.flatMap((t) => [
          { title: { contains: t, mode: 'insensitive' as const } },
          { description: { contains: t, mode: 'insensitive' as const } },
          { reference: { contains: t, mode: 'insensitive' as const } },
          { content: { contains: t, mode: 'insensitive' as const } },
        ]),
      },
      take: 20,
      select: {
        id: true,
        title: true,
        reference: true,
        description: true,
        category: true,
        status: true,
        classification: true,
        updatedAt: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    }).catch((err) => {
      this.logger.warn(`searchDocuments: ${err?.message}`);
      return [];
    });

    // ISO 27001 A.5.12: filter by classification level
    const roleLevel = userRole ? ROLE_HIERARCHY[userRole] : ROLE_HIERARCHY[UserRole.COLLABORATEUR];
    const classificationAccess: Record<string, number> = {
      PUBLIC: 0,
      INTERNE: 10,
      CONFIDENTIEL: 50,
      SECRET: 80,
    };

    const filtered = docs.filter((doc) => {
      const requiredLevel = classificationAccess[doc.classification] ?? 0;
      return roleLevel >= requiredLevel;
    });

    return this.scoreResults(filtered, tokens);
  }

  private async searchWiki(tokens: string[]) {
    const pages = await this.prisma.wikiPage.findMany({
      where: {
        isPublished: true,
        OR: tokens.flatMap((t) => [
          { title: { contains: t, mode: 'insensitive' as const } },
          { content: { contains: t, mode: 'insensitive' as const } },
          { category: { contains: t, mode: 'insensitive' as const } },
        ]),
      },
      take: 15,
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        updatedAt: true,
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    }).catch((err) => {
      this.logger.warn(`searchWiki: ${err?.message}`);
      return [];
    });

    return this.scoreResults(pages, tokens);
  }

  private async searchTickets(tokens: string[]) {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        OR: tokens.flatMap((t) => [
          { title: { contains: t, mode: 'insensitive' as const } },
          { description: { contains: t, mode: 'insensitive' as const } },
          { reference: { contains: t, mode: 'insensitive' as const } },
        ]),
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        reference: true,
        status: true,
        priority: true,
        category: true,
        updatedAt: true,
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    }).catch((err) => {
      this.logger.warn(`searchTickets: ${err?.message}`);
      return [];
    });

    return this.scoreResults(tickets, tokens);
  }

  private async searchNews(tokens: string[]) {
    const posts = await this.prisma.newsPost.findMany({
      where: {
        isPublished: true,
        deletedAt: null,
        OR: tokens.flatMap((t) => [
          { title: { contains: t, mode: 'insensitive' as const } },
          { content: { contains: t, mode: 'insensitive' as const } },
          { excerpt: { contains: t, mode: 'insensitive' as const } },
        ]),
      },
      take: 10,
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        category: true,
        publishedAt: true,
        updatedAt: true,
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    }).catch((err) => {
      this.logger.warn(`searchNews: ${err?.message}`);
      return [];
    });

    return this.scoreResults(posts, tokens);
  }

  private async searchRunbooks(tokens: string[]) {
    const runbooks = await this.prisma.runbook.findMany({
      where: {
        isPublished: true,
        OR: tokens.flatMap((t) => [
          { title: { contains: t, mode: 'insensitive' as const } },
          { description: { contains: t, mode: 'insensitive' as const } },
          { category: { contains: t, mode: 'insensitive' as const } },
        ]),
      },
      take: 10,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        category: true,
        updatedAt: true,
      },
    }).catch((err) => {
      this.logger.warn(`searchRunbooks: ${err?.message}`);
      return [];
    });

    return this.scoreResults(runbooks, tokens);
  }

  private async searchVeille(tokens: string[]) {
    const items = await this.prisma.veilleItem.findMany({
      where: {
        OR: tokens.flatMap((t) => [
          { title: { contains: t, mode: 'insensitive' as const } },
          { description: { contains: t, mode: 'insensitive' as const } },
          { sourceName: { contains: t, mode: 'insensitive' as const } },
          { cveId: { contains: t, mode: 'insensitive' as const } },
        ]),
      },
      take: 10,
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        sourceUrl: true,
        sourceName: true,
        severity: true,
        cveId: true,
        publishedAt: true,
      },
    }).catch((err) => {
      this.logger.warn(`searchVeille: ${err?.message}`);
      return [];
    });

    return this.scoreResults(items, tokens);
  }

  private async searchKB(tokens: string[]) {
    // KB = knowledge base = wiki pages with visibility PUBLIC
    // Note: searchWiki already returns all published pages (including PUBLIC).
    // Here we return only PUBLIC pages that also have a 'kb' or 'faq' category
    // to avoid duplicating generic wiki results.
    const pages = await this.prisma.wikiPage.findMany({
      where: {
        isPublished: true,
        visibility: 'PUBLIC',
        AND: [
          {
            OR: [
              { category: { contains: 'support', mode: 'insensitive' as const } },
              { category: { contains: 'faq', mode: 'insensitive' as const } },
              { category: { contains: 'kb', mode: 'insensitive' as const } },
              { category: { contains: 'helpdesk', mode: 'insensitive' as const } },
            ],
          },
          {
            OR: tokens.flatMap((t) => [
              { title: { contains: t, mode: 'insensitive' as const } },
              { content: { contains: t, mode: 'insensitive' as const } },
            ]),
          },
        ],
      },
      take: 10,
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        updatedAt: true,
      },
    }).catch((err) => {
      this.logger.warn(`searchKB: ${err?.message}`);
      return [];
    });

    return this.scoreResults(pages, tokens);
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Tokenize text: lowercase, remove accents, remove stop-words, keep tokens > 2 chars.
   */
  private tokenize(text: string): string[] {
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ');

    return normalized
      .split(/\s+/)
      .filter((t) => t.length > 2 && !FR_STOP_WORDS.has(t));
  }

  /**
   * Score results with TF-IDF-like algorithm:
   * - title match: 3x weight
   * - body match: 1x weight
   * - recency bonus: +20%
   * - popularity bonus: +15%
   */
  private scoreResults<T extends Record<string, any>>(items: T[], tokens: string[]): (T & { _score: number })[] {
    const now = Date.now();

    const scored = items.map((item) => {
      let score = 0;

      const title = (item.title || '').toLowerCase();
      const body = (item.description || item.content || item.excerpt || '').toLowerCase();

      for (const token of tokens) {
        // Title match: 3x weight
        if (title.includes(token)) {
          score += 3;
        }
        // Body match: 1x weight
        if (body.includes(token)) {
          score += 1;
        }
      }

      // Recency bonus: +20% for items updated/published in the last 30 days
      const updated = item.updatedAt || item.publishedAt;
      if (updated) {
        const age = now - new Date(updated).getTime();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        if (age < thirtyDays) {
          score *= 1.2;
        }
      }

      // Popularity bonus: +15% for items that have views or acknowledgments count
      if (item.views?.length || item.acknowledgments?.length) {
        score *= 1.15;
      }

      return { ...item, _score: Math.round(score * 100) / 100 };
    });

    return scored.sort((a, b) => b._score - a._score);
  }

  /**
   * Levenshtein distance between two strings.
   */
  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    return dp[m][n];
  }

  /**
   * "Did you mean?" suggestions by comparing query against known titles.
   */
  private computeDidYouMean(query: string, titles: string[]): string[] {
    const normalizedQuery = query.toLowerCase().trim();
    const suggestions: Array<{ title: string; distance: number }> = [];

    for (const title of titles) {
      const normalizedTitle = title.toLowerCase();
      const distance = this.levenshtein(normalizedQuery, normalizedTitle);
      const maxLen = Math.max(normalizedQuery.length, normalizedTitle.length);
      const similarity = 1 - distance / maxLen;

      // Only suggest if reasonably close but not exact
      if (similarity > 0.4 && similarity < 1.0) {
        suggestions.push({ title, distance });
      }
    }

    return suggestions
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((s) => s.title);
  }

  /**
   * Time-based greeting for user.
   */
  private getSmartGreeting(firstName: string): string {
    const hour = new Date().getHours();
    if (hour < 12) return `Bonjour ${firstName} !`;
    if (hour < 18) return `Bon apres-midi ${firstName} !`;
    return `Bonsoir ${firstName} !`;
  }
}
