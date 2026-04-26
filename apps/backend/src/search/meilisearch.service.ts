import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

/** Lightweight Meilisearch HTTP client (avoids ESM import issues with SDK) */
class MeiliClient {
  private http: AxiosInstance;
  constructor(host: string, apiKey: string) {
    this.http = axios.create({
      baseURL: host,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30_000,
    });
  }
  async health() { return (await this.http.get('/health')).data; }
  async getIndex(uid: string) { return (await this.http.get(`/indexes/${uid}`)).data; }
  async createIndex(uid: string, opts: { primaryKey?: string }) {
    return (await this.http.post('/indexes', { uid, primaryKey: opts.primaryKey })).data;
  }
  async updateSettings(uid: string, settings: Record<string, unknown>) {
    return (await this.http.patch(`/indexes/${uid}/settings`, settings)).data;
  }
  async addDocuments(uid: string, docs: unknown[]) {
    return (await this.http.post(`/indexes/${uid}/documents`, docs)).data;
  }
  async deleteDocument(uid: string, docId: string) {
    return (await this.http.delete(`/indexes/${uid}/documents/${docId}`)).data;
  }
  async multiSearch(body: { queries: Array<{ indexUid: string; q: string; limit?: number; filter?: string; attributesToHighlight?: string[] }> }) {
    return (await this.http.post('/multi-search', body)).data;
  }
  async getStats() { return (await this.http.get('/stats')).data; }
  index(uid: string) {
    const http = this.http;
    return {
      async updateSettings(settings: Record<string, unknown>) {
        return (await http.patch(`/indexes/${uid}/settings`, settings)).data;
      },
      async addDocuments(docs: unknown[]) {
        return (await http.post(`/indexes/${uid}/documents`, docs)).data;
      },
      async deleteDocument(docId: string) {
        return (await http.delete(`/indexes/${uid}/documents/${docId}`)).data;
      },
      async search(q: string, opts?: Record<string, unknown>) {
        return (await http.post(`/indexes/${uid}/search`, { q, ...opts })).data;
      },
      async getStats() {
        return (await http.get(`/indexes/${uid}/stats`)).data;
      },
    };
  }
}
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service Meilisearch — recherche federee pour l'intranet OMNITECH.
 *
 * Utilise le SDK officiel `meilisearch` (npm).
 *
 * Index names :
 *   - wiki       : Pages wiki (WikiPage)
 *   - documents  : Documents GED (Document)
 *   - news       : Actualites (NewsPost)
 *   - tickets    : Tickets helpdesk (Ticket)
 */

export interface MeiliDocument {
  id: string;
  title: string;
  content: string;
  type: 'document' | 'ticket' | 'wiki' | 'news' | 'runbook';
  url: string;
  author?: string | null;
  authorId?: string | null;
  date?: string | null;
  tags?: string[];
  category?: string | null;
  classification?: string | null;
  status?: string | null;
  reference?: string | null;
  slug?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface MeiliSearchFilters {
  type?: string;
  limit?: number;
  offset?: number;
  filter?: string;
}

export interface MeiliSearchResponse {
  hits: MeiliDocument[];
  total: number;
  byIndex?: Record<string, { hits: MeiliDocument[]; total: number }>;
}

const INDEX_WIKI = 'wiki';
const INDEX_DOCUMENTS = 'documents';
const INDEX_NEWS = 'news';
const INDEX_TICKETS = 'tickets';
const INDEX_RUNBOOKS = 'runbooks';

const ALL_INDEXES = [
  INDEX_WIKI,
  INDEX_DOCUMENTS,
  INDEX_NEWS,
  INDEX_TICKETS,
  INDEX_RUNBOOKS,
] as const;

const SEARCHABLE_ATTRIBUTES = ['title', 'content', 'summary', 'category', 'reference', 'tags', 'slug'];
const FILTERABLE_ATTRIBUTES = ['category', 'status', 'classification', 'authorId', 'type'];

@Injectable()
export class MeilisearchService implements OnModuleInit {
  private readonly logger = new Logger(MeilisearchService.name);
  private client: any = null;
  readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    this.enabled = process.env.MEILISEARCH_ENABLED === 'true';
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Meilisearch desactive (MEILISEARCH_ENABLED != true)');
      return;
    }

    const host = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const apiKey = process.env.MEILISEARCH_MASTER_KEY || '';

    if (!apiKey) {
      this.logger.warn('MEILISEARCH_MASTER_KEY vide — le service sera non-fonctionnel.');
      return;
    }

    try {
      this.client = new MeiliClient(host, apiKey);
      const health = await this.client.health();
      this.logger.log(`Meilisearch connecte (status: ${health.status})`);
      await this.ensureAllIndexes();
    } catch (err) {
      this.logger.warn(`Meilisearch init echouee (non-bloquant) : ${(err as Error).message}`);
      this.client = null;
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  // ==========================================================================
  // Index configuration
  // ==========================================================================

  private async ensureIndex(uid: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.createIndex(uid, { primaryKey: 'id' });
    } catch {
      // index already exists — ignore
    }

    const index = this.client.index(uid);
    await index.updateSettings({
      searchableAttributes: SEARCHABLE_ATTRIBUTES,
      filterableAttributes: FILTERABLE_ATTRIBUTES,
      sortableAttributes: ['date'],
    });
  }

  async ensureAllIndexes(): Promise<void> {
    if (!this.client) return;
    await Promise.all(ALL_INDEXES.map((idx) => this.ensureIndex(idx)));
    this.logger.log('Tous les index Meilisearch configures');
  }

  // ==========================================================================
  // Indexation
  // ==========================================================================

  async indexDocuments(docs: MeiliDocument[]): Promise<void> {
    if (!this.client || docs.length === 0) return;
    await this.pushToIndex(INDEX_DOCUMENTS, docs);
  }

  async indexTickets(tickets: MeiliDocument[]): Promise<void> {
    if (!this.client || tickets.length === 0) return;
    await this.pushToIndex(INDEX_TICKETS, tickets);
  }

  async indexWikiPages(pages: MeiliDocument[]): Promise<void> {
    if (!this.client || pages.length === 0) return;
    await this.pushToIndex(INDEX_WIKI, pages);
  }

  async indexNews(news: MeiliDocument[]): Promise<void> {
    if (!this.client || news.length === 0) return;
    await this.pushToIndex(INDEX_NEWS, news);
  }

  async indexRunbooks(runbooks: MeiliDocument[]): Promise<void> {
    if (!this.client || runbooks.length === 0) return;
    await this.pushToIndex(INDEX_RUNBOOKS, runbooks);
  }

  private async pushToIndex(uid: string, docs: MeiliDocument[]): Promise<void> {
    if (!this.client) return;
    try {
      const index = this.client.index(uid);
      await index.addDocuments(docs);
      this.logger.log(`${docs.length} document(s) pousse(s) vers ${uid}`);
    } catch (err) {
      this.logger.error(`pushToIndex(${uid}) a echoue : ${(err as Error).message}`);
    }
  }

  /** Supprime un document d'un index. */
  async deleteDocument(type: MeiliDocument['type'], id: string): Promise<void> {
    if (!this.client) return;
    const uid = this.indexForType(type);
    try {
      const index = this.client.index(uid);
      await index.deleteDocument(id);
    } catch (err) {
      this.logger.error(`deleteDocument(${uid}, ${id}) a echoue : ${(err as Error).message}`);
    }
  }

  private indexForType(type: MeiliDocument['type']): string {
    switch (type) {
      case 'ticket': return INDEX_TICKETS;
      case 'wiki': return INDEX_WIKI;
      case 'news': return INDEX_NEWS;
      case 'runbook': return INDEX_RUNBOOKS;
      case 'document':
      default: return INDEX_DOCUMENTS;
    }
  }

  // ==========================================================================
  // Index one item (used by hooks)
  // ==========================================================================

  async indexOne(type: MeiliDocument['type'], doc: MeiliDocument): Promise<void> {
    if (!this.client) return;
    const uid = this.indexForType(type);
    try {
      const index = this.client.index(uid);
      await index.addDocuments([doc]);
    } catch (err) {
      this.logger.error(`indexOne(${uid}, ${doc.id}) a echoue : ${(err as Error).message}`);
    }
  }

  // ==========================================================================
  // Federated search (multi-index)
  // ==========================================================================

  async search(
    query: string,
    filters: MeiliSearchFilters = {},
  ): Promise<MeiliSearchResponse> {
    if (!this.client) {
      return { hits: [], total: 0 };
    }

    const limit = Math.min(filters.limit ?? 20, 100);
    const targetIndexes: readonly string[] = filters.type
      ? [this.indexForType(filters.type as MeiliDocument['type'])]
      : ALL_INDEXES;

    try {
      const queries = targetIndexes.map((indexUid) => ({
        indexUid,
        q: query,
        limit,
        filter: filters.filter || undefined,
        attributesToHighlight: ['title', 'content'],
      }));

      const data: any = await this.client.multiSearch({ queries });

      const byIndex: Record<string, { hits: MeiliDocument[]; total: number }> = {};
      let allHits: MeiliDocument[] = [];
      let total = 0;

      for (const r of data.results || []) {
        const hits = r.hits as MeiliDocument[];
        byIndex[r.indexUid] = {
          hits,
          total: r.estimatedTotalHits ?? 0,
        };
        allHits = allHits.concat(hits);
        total += r.estimatedTotalHits ?? 0;
      }

      return { hits: allHits, total, byIndex };
    } catch (err) {
      this.logger.error(`search("${query}") a echoue : ${(err as Error).message}`);
      return { hits: [], total: 0 };
    }
  }

  // ==========================================================================
  // Full reindex from Prisma
  // ==========================================================================

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async reindexAll(): Promise<{
    documents: number;
    tickets: number;
    wiki: number;
    news: number;
    runbooks: number;
  }> {
    if (!this.client) {
      this.logger.warn('reindexAll appele mais Meilisearch desactive — no-op.');
      return { documents: 0, tickets: 0, wiki: 0, news: 0, runbooks: 0 };
    }

    await this.ensureAllIndexes();

    // Documents
    const documents = await this.prisma.document
      .findMany({
        where: { deletedAt: null },
        select: {
          id: true, title: true, description: true, reference: true,
          category: true, classification: true, status: true,
          ownerId: true, createdAt: true,
        },
      })
      .catch((err) => {
        this.logger.warn(`Lecture documents KO : ${err.message}`);
        return [];
      });

    const docsPayload: MeiliDocument[] = documents.map((d) => ({
      id: `document-${d.id}`,
      title: d.title ?? '',
      content: d.description ?? '',
      type: 'document' as const,
      url: `/documents/${d.id}`,
      authorId: d.ownerId,
      date: d.createdAt?.toISOString?.() ?? null,
      category: d.category,
      classification: d.classification,
      status: d.status,
      reference: d.reference,
      tags: [d.category, d.classification, d.status].filter(Boolean),
    }));
    await this.indexDocuments(docsPayload);

    // Tickets
    const tickets = await this.prisma.ticket
      .findMany({
        select: {
          id: true, reference: true, title: true, description: true,
          status: true, priority: true, category: true,
          creatorId: true, createdAt: true,
        },
      })
      .catch((err) => {
        this.logger.warn(`Lecture tickets KO : ${err.message}`);
        return [];
      });

    const ticketsPayload: MeiliDocument[] = tickets.map((t) => ({
      id: `ticket-${t.id}`,
      title: `[${t.reference}] ${t.title ?? ''}`,
      content: t.description ?? '',
      type: 'ticket' as const,
      url: `/tickets/${t.id}`,
      authorId: t.creatorId,
      date: t.createdAt?.toISOString?.() ?? null,
      category: t.category,
      status: t.status,
      reference: t.reference,
      tags: [t.category, t.priority, t.status].filter(Boolean),
    }));
    await this.indexTickets(ticketsPayload);

    // Wiki
    const wiki = await this.prisma.wikiPage
      .findMany({
        where: { isPublished: true },
        select: {
          id: true, title: true, content: true, slug: true,
          category: true, authorId: true, updatedAt: true,
        },
      })
      .catch((err: Error) => {
        this.logger.warn(`Lecture wiki KO : ${err.message}`);
        return [];
      });

    const wikiPayload: MeiliDocument[] = wiki.map((w) => ({
      id: `wiki-${w.id}`,
      title: w.title ?? '',
      content: this.stripHtml(w.content ?? ''),
      type: 'wiki' as const,
      url: `/wiki/${w.slug ?? w.id}`,
      authorId: w.authorId,
      date: w.updatedAt?.toISOString?.() ?? null,
      category: w.category,
      tags: [w.category].filter((t): t is string => Boolean(t)),
    }));
    await this.indexWikiPages(wikiPayload);

    // News
    const news = await this.prisma.newsPost
      .findMany({
        where: { deletedAt: null, isPublished: true },
        select: {
          id: true, title: true, content: true, excerpt: true,
          slug: true, category: true, authorId: true, publishedAt: true,
        },
      })
      .catch((err: Error) => {
        this.logger.warn(`Lecture news KO : ${err.message}`);
        return [];
      });

    const newsPayload: MeiliDocument[] = news.map((n) => ({
      id: `news-${n.id}`,
      title: n.title ?? '',
      content: this.stripHtml(n.content ?? n.excerpt ?? ''),
      type: 'news' as const,
      url: `/news/${n.slug ?? n.id}`,
      authorId: n.authorId,
      date: n.publishedAt?.toISOString?.() ?? null,
      category: n.category,
      tags: [n.category].filter((t): t is string => Boolean(t)),
    }));
    await this.indexNews(newsPayload);

    // Runbooks — seules les runbooks publiees sont indexees (les drafts restent
    // hors de la recherche globale pour eviter toute fuite de contenu non pret).
    const runbooks = await this.prisma.runbook
      .findMany({
        where: { isPublished: true },
        select: {
          id: true, title: true, slug: true, description: true,
          content: true, category: true, version: true,
          authorId: true, updatedAt: true,
        },
      })
      .catch((err: Error) => {
        this.logger.warn(`Lecture runbooks KO : ${err.message}`);
        return [];
      });

    const runbooksPayload: MeiliDocument[] = runbooks.map((r) =>
      this.runbookToMeiliDocument(r),
    );
    await this.indexRunbooks(runbooksPayload);

    const summary = {
      documents: docsPayload.length,
      tickets: ticketsPayload.length,
      wiki: wikiPayload.length,
      news: newsPayload.length,
      runbooks: runbooksPayload.length,
    };
    this.logger.log(`reindexAll termine : ${JSON.stringify(summary)}`);
    return summary;
  }

  /**
   * Convertit un runbook Prisma en document Meilisearch.
   * Centralise la forme du document pour que les hooks incrementaux
   * (create/update/delete dans RunbooksService) produisent exactement le
   * meme shape que `reindexAll()`.
   */
  runbookToMeiliDocument(r: {
    id: string;
    title: string;
    slug?: string | null;
    description?: string | null;
    content?: string | null;
    category?: string | null;
    version?: string | null;
    authorId?: string | null;
    updatedAt?: Date | null;
  }): MeiliDocument {
    // `content` est du JSON array of steps — on le rend cherchable en
    // concatenant les champs textuels principaux (title/label/description)
    // s'ils existent, sinon fallback sur la chaine brute.
    let stepsText = '';
    if (r.content) {
      try {
        const parsed = JSON.parse(r.content);
        if (Array.isArray(parsed)) {
          stepsText = parsed
            .map((s: any) =>
              [s?.title, s?.label, s?.description, s?.command, s?.content]
                .filter((v) => typeof v === 'string')
                .join(' '),
            )
            .join(' ')
            .trim();
        }
      } catch {
        stepsText = r.content;
      }
    }
    const summary = (r.description ?? '').slice(0, 500) || null;
    return {
      id: `runbook-${r.id}`,
      title: r.title ?? '',
      content: this.stripHtml(`${r.description ?? ''} ${stepsText}`.trim()),
      type: 'runbook',
      url: `/runbooks/${r.slug ?? r.id}`,
      slug: r.slug ?? null,
      summary,
      authorId: r.authorId ?? null,
      date: r.updatedAt?.toISOString?.() ?? null,
      category: r.category ?? null,
      tags: [r.category, r.version].filter(Boolean) as string[],
    };
  }

  // ==========================================================================
  // Health / stats
  // ==========================================================================

  /**
   * Ping Meilisearch pour /search/v2/health (admin/system-health + portail).
   * Retourne `{ ok: true }` si Meili répond, `{ ok: false }` sinon.
   */
  async isHealthy(): Promise<{ ok: boolean; status?: string; error?: string }> {
    if (!this.client || !this.enabled) {
      return { ok: false, status: 'disabled' };
    }
    try {
      const res = await this.client.health();
      return { ok: true, status: res?.status ?? 'available' };
    } catch (err) {
      return { ok: false, status: 'unreachable', error: (err as Error).message };
    }
  }

  async stats(): Promise<{
    available: boolean;
    enabled: boolean;
    indexes: Record<string, number>;
    error?: string;
  }> {
    if (!this.client) {
      return { available: false, enabled: this.enabled, indexes: {} };
    }

    try {
      await this.client.health();
      const indexes: Record<string, number> = {};
      for (const uid of ALL_INDEXES) {
        try {
          const idx = this.client.index(uid);
          const s = await idx.getStats();
          indexes[uid] = s.numberOfDocuments ?? 0;
        } catch {
          indexes[uid] = -1;
        }
      }
      return { available: true, enabled: true, indexes };
    } catch (err) {
      return {
        available: false,
        enabled: true,
        indexes: {},
        error: (err as Error).message,
      };
    }
  }
}
