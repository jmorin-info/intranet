import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

export type SearchType = 'documents' | 'news' | 'wiki' | 'tickets' | 'runbooks' | 'all';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: string,
    type: SearchType,
    pagination: { page?: number; limit?: number },
    currentUser: RequestUser,
  ) {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const offset = (page - 1) * limit;
    const sanitizedQuery = query.replace(/[^\w\s]/g, ' ').trim();

    if (!sanitizedQuery) {
      return { documents: [], news: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    const results: { documents?: any[]; news?: any[]; wiki?: any[]; tickets?: any[]; runbooks?: any[] } = {};
    const counts: { documents?: number; news?: number; wiki?: number; tickets?: number; runbooks?: number } = {};
    let totalCount = 0;

    const userRole = (currentUser.role || '').toUpperCase() as UserRole;

    // Search documents
    if (type === 'documents' || type === 'all') {
      let statusFilter: string;
      if (userRole === UserRole.COLLABORATEUR) {
        statusFilter = `AND d.status = 'APPROVED' AND d.classification IN ('PUBLIC','INTERNE')`;
      } else if (userRole === UserRole.AUDITEUR) {
        statusFilter = `AND d.status = 'APPROVED' AND d.classification IN ('PUBLIC','INTERNE','CONFIDENTIEL')`;
      } else if (userRole === UserRole.REVIEWER) {
        statusFilter = `AND d.classification IN ('PUBLIC','INTERNE','CONFIDENTIEL')`;
      } else {
        statusFilter = '';
      }

      const docResults = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT d.id, d.title, d.reference, d.description, d.status, d.category, d."createdAt",
                ts_rank(to_tsvector('french', coalesce(d.title, '') || ' ' || coalesce(d.description, '')),
                        plainto_tsquery('french', $1)) AS rank
         FROM "Document" d
         WHERE d."deletedAt" IS NULL
           ${statusFilter}
           AND (
             to_tsvector('french', coalesce(d.title, '') || ' ' || coalesce(d.description, ''))
               @@ plainto_tsquery('french', $1)
             OR d.reference ILIKE '%' || $1 || '%'
             OR d.title ILIKE '%' || $1 || '%'
           )
         ORDER BY rank DESC
         LIMIT $2 OFFSET $3`,
        sanitizedQuery,
        limit,
        offset,
      );

      const docCount = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT count(*)::int as count
         FROM "Document" d
         WHERE d."deletedAt" IS NULL
           ${statusFilter}
           AND (
             to_tsvector('french', coalesce(d.title, '') || ' ' || coalesce(d.description, ''))
               @@ plainto_tsquery('french', $1)
             OR d.reference ILIKE '%' || $1 || '%'
             OR d.title ILIKE '%' || $1 || '%'
           )`,
        sanitizedQuery,
      );

      results.documents = docResults;
      counts.documents = Number(docCount[0]?.count || 0);
      totalCount += counts.documents;
    }

    // Search news
    if (type === 'news' || type === 'all') {
      const newsResults = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT n.id, n.title, n.slug, n.excerpt, n.category, n."publishedAt",
                ts_rank(to_tsvector('french', coalesce(n.title, '') || ' ' || coalesce(n.content, '')),
                        plainto_tsquery('french', $1)) AS rank
         FROM "NewsPost" n
         WHERE n."deletedAt" IS NULL
           AND n."isPublished" = true
           AND $4 = ANY(n."targetRoles"::text[])
           AND (
             to_tsvector('french', coalesce(n.title, '') || ' ' || coalesce(n.content, ''))
               @@ plainto_tsquery('french', $1)
             OR n.title ILIKE '%' || $1 || '%'
           )
         ORDER BY rank DESC
         LIMIT $2 OFFSET $3`,
        sanitizedQuery,
        limit,
        offset,
        userRole,
      );

      const newsCount = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT count(*)::int as count
         FROM "NewsPost" n
         WHERE n."deletedAt" IS NULL
           AND n."isPublished" = true
           AND $2 = ANY(n."targetRoles"::text[])
           AND (
             to_tsvector('french', coalesce(n.title, '') || ' ' || coalesce(n.content, ''))
               @@ plainto_tsquery('french', $1)
             OR n.title ILIKE '%' || $1 || '%'
           )`,
        sanitizedQuery,
        userRole,
      );

      results.news = newsResults;
      counts.news = Number(newsCount[0]?.count || 0);
      totalCount += counts.news;
    }

    // Search wiki pages
    if (type === 'wiki' || type === 'all') {
      const wikiResults = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT w.id, w.title, w.slug, w.category, w."createdAt", w."updatedAt",
                ts_rank(to_tsvector('french', coalesce(w.title, '') || ' ' || coalesce(w.content, '')),
                        plainto_tsquery('french', $1)) AS rank
         FROM "WikiPage" w
         WHERE w."isPublished" = true
           AND (
             to_tsvector('french', coalesce(w.title, '') || ' ' || coalesce(w.content, ''))
               @@ plainto_tsquery('french', $1)
             OR w.title ILIKE '%' || $1 || '%'
           )
         ORDER BY rank DESC
         LIMIT $2 OFFSET $3`,
        sanitizedQuery,
        limit,
        offset,
      );

      const wikiCount = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT count(*)::int as count
         FROM "WikiPage" w
         WHERE w."isPublished" = true
           AND (
             to_tsvector('french', coalesce(w.title, '') || ' ' || coalesce(w.content, ''))
               @@ plainto_tsquery('french', $1)
             OR w.title ILIKE '%' || $1 || '%'
           )`,
        sanitizedQuery,
      );

      results.wiki = wikiResults;
      counts.wiki = Number(wikiCount[0]?.count || 0);
      totalCount += counts.wiki;
    }

    // Search tickets (title, description)
    if (type === 'tickets' || type === 'all') {
      // Role-based: collaborateurs see only their own tickets.
      // IMPORTANT: currentUser.id is passed as a bound parameter ($N), never interpolated,
      // to prevent SQL injection even on structured UUIDs.
      const isCollaborateur = userRole === UserRole.COLLABORATEUR;
      const ticketRoleFilter = isCollaborateur ? `AND t."creatorId" = $4` : '';
      const ticketCountRoleFilter = isCollaborateur ? `AND t."creatorId" = $2` : '';

      const ticketQueryParams: unknown[] = [sanitizedQuery, limit, offset];
      if (isCollaborateur) ticketQueryParams.push(currentUser.id);

      const ticketResults = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT t.id, t.reference, t.title, t.status, t.priority, t.category, t."createdAt",
                ts_rank(to_tsvector('french', coalesce(t.title, '') || ' ' || coalesce(t.description, '')),
                        plainto_tsquery('french', $1)) AS rank
         FROM "Ticket" t
         WHERE (
             to_tsvector('french', coalesce(t.title, '') || ' ' || coalesce(t.description, ''))
               @@ plainto_tsquery('french', $1)
             OR t.title ILIKE '%' || $1 || '%'
             OR t.reference ILIKE '%' || $1 || '%'
           )
           ${ticketRoleFilter}
         ORDER BY rank DESC
         LIMIT $2 OFFSET $3`,
        ...ticketQueryParams,
      );

      const ticketCountParams: unknown[] = [sanitizedQuery];
      if (isCollaborateur) ticketCountParams.push(currentUser.id);

      const ticketCount = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT count(*)::int as count
         FROM "Ticket" t
         WHERE (
             to_tsvector('french', coalesce(t.title, '') || ' ' || coalesce(t.description, ''))
               @@ plainto_tsquery('french', $1)
             OR t.title ILIKE '%' || $1 || '%'
             OR t.reference ILIKE '%' || $1 || '%'
           )
           ${ticketCountRoleFilter}`,
        ...ticketCountParams,
      );

      results.tickets = ticketResults;
      counts.tickets = Number(ticketCount[0]?.count || 0);
      totalCount += counts.tickets;
    }

    // Search runbooks (title, description, content)
    // Les runbooks sont visibles a tous les utilisateurs authentifies. Seuls
    // les drafts (isPublished = false) sont masques — ceux-ci etant reserves
    // aux admins qui les editent, on ne les sort pas dans la recherche globale
    // meme pour les admins (verbe "search", pas "audit").
    if (type === 'runbooks' || type === 'all') {
      const runbookResults = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT r.id, r.title, r.slug, r.description, r.category, r.version,
                r."createdAt", r."updatedAt",
                ts_rank(to_tsvector('french', coalesce(r.title, '') || ' ' || coalesce(r.description, '') || ' ' || coalesce(r.content, '')),
                        plainto_tsquery('french', $1)) AS rank
         FROM "Runbook" r
         WHERE r."isPublished" = true
           AND (
             to_tsvector('french', coalesce(r.title, '') || ' ' || coalesce(r.description, '') || ' ' || coalesce(r.content, ''))
               @@ plainto_tsquery('french', $1)
             OR r.title ILIKE '%' || $1 || '%'
             OR r.slug ILIKE '%' || $1 || '%'
           )
         ORDER BY rank DESC
         LIMIT $2 OFFSET $3`,
        sanitizedQuery,
        limit,
        offset,
      );

      const runbookCount = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT count(*)::int as count
         FROM "Runbook" r
         WHERE r."isPublished" = true
           AND (
             to_tsvector('french', coalesce(r.title, '') || ' ' || coalesce(r.description, '') || ' ' || coalesce(r.content, ''))
               @@ plainto_tsquery('french', $1)
             OR r.title ILIKE '%' || $1 || '%'
             OR r.slug ILIKE '%' || $1 || '%'
           )`,
        sanitizedQuery,
      );

      results.runbooks = runbookResults;
      counts.runbooks = Number(runbookCount[0]?.count || 0);
      totalCount += counts.runbooks;
    }

    return {
      ...results,
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        counts,
      },
    };
  }
}
