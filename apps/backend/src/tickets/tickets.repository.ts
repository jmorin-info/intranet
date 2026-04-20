import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * TicketsRepository — data-access layer for Ticket entity.
 *
 * Encapsulates ALL Prisma ticket operations. The TicketsService depends on
 * this repository instead of PrismaService directly for ticket queries.
 * Cross-domain lookups (User, Department, AppConfig) remain in the service.
 *
 * Design rationale:
 *  - Methods return raw Prisma results (no business logic, no SLA enrichment)
 *  - "where" objects are built by the service and passed in (filter logic stays in service)
 *  - Thin wrapper: adds testability and decouples from Prisma API surface
 */

// Re-usable include fragments to keep DRY
const TICKET_LIST_INCLUDE = {
  creator: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  department: { select: { id: true, name: true, code: true } },
  _count: { select: { comments: true } },
} as const;

const TICKET_DETAIL_INCLUDE_ADMIN = {
  creator: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  comments: {
    where: {},
    include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

const TICKET_DETAIL_INCLUDE_USER = {
  creator: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  comments: {
    where: { isInternal: false },
    include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

const TICKET_CREATE_INCLUDE = {
  creator: { select: { id: true, firstName: true, lastName: true } },
  department: { select: { id: true, name: true, code: true } },
} as const;

@Injectable()
export class TicketsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Single-item operations ─────────────────────────────────────

  async findById(id: string, isAdmin: boolean) {
    return this.prisma.ticket.findUnique({
      where: { id },
      include: isAdmin ? TICKET_DETAIL_INCLUDE_ADMIN : TICKET_DETAIL_INCLUDE_USER,
    });
  }

  async findByIdRaw(id: string) {
    return this.prisma.ticket.findUnique({ where: { id } });
  }

  // ── List operations ────────────────────────────────────────────

  async findManyWithCount(
    where: any,
    skip: number,
    take: number,
  ): Promise<[any[], number]> {
    return Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: TICKET_LIST_INCLUDE,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.ticket.count({ where }),
    ]);
  }

  // ── Create / Update ────────────────────────────────────────────

  async create(data: any) {
    return this.prisma.ticket.create({
      data,
      include: TICKET_CREATE_INCLUDE,
    });
  }

  async update(id: string, data: any) {
    return this.prisma.ticket.update({
      where: { id },
      data,
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateMany(where: any, data: any) {
    return this.prisma.ticket.updateMany({ where, data });
  }

  // ── Counts & Aggregation ───────────────────────────────────────

  async count(where?: any): Promise<number> {
    return this.prisma.ticket.count({ where });
  }

  async countMany(queries: Array<{ where?: any }>): Promise<number[]> {
    return Promise.all(queries.map((q) => this.prisma.ticket.count({ where: q.where })));
  }

  async groupByPriority(where?: any) {
    return this.prisma.ticket.groupBy({
      by: ['priority'],
      where,
      _count: true,
    });
  }

  // ── Bulk / batch queries ───────────────────────────────────────

  async findManyRaw(where: any, select?: any, orderBy?: any, take?: number) {
    return this.prisma.ticket.findMany({
      where,
      ...(select ? { select } : {}),
      ...(orderBy ? { orderBy } : {}),
      ...(take ? { take } : {}),
    });
  }

  // ── Comment operations ─────────────────────────────────────────

  async createComment(data: {
    ticketId: string;
    authorId: string;
    content: string;
    isInternal: boolean;
  }) {
    return this.prisma.ticketComment.create({
      data,
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });
  }

  // ── Department-scoped queries ──────────────────────────────────

  async findByDepartment() {
    return Promise.all([
      this.prisma.department.findMany({
        orderBy: { name: 'asc' },
        include: {
          tickets: {
            where: { status: { notIn: ['CLOSED'] } },
            select: {
              id: true,
              reference: true,
              title: true,
              status: true,
              priority: true,
              category: true,
              createdAt: true,
              creator: { select: { id: true, firstName: true, lastName: true } },
              assignee: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            take: 50,
          },
          _count: { select: { tickets: true } },
        },
      }),
      this.prisma.ticket.findMany({
        where: { departmentId: null, status: { notIn: ['CLOSED'] } },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          priority: true,
          category: true,
          createdAt: true,
          creator: { select: { id: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
    ]);
  }

  async findByUserDepartment(departmentId: string) {
    return Promise.all([
      this.prisma.ticket.findMany({
        where: { departmentId },
        include: {
          creator: { select: { id: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { comments: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      this.prisma.ticket.count({ where: { departmentId } }),
      this.prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true, name: true, code: true },
      }),
    ]);
  }

  // ── Delete ──────────────────────────────────────────────────────

  async deleteWithRelations(id: string) {
    return this.prisma.$transaction([
      this.prisma.ticketComment.deleteMany({ where: { ticketId: id } }),
      this.prisma.ticket.delete({ where: { id } }),
    ]);
  }

  // ── Reference generation ───────────────────────────────────────

  private seqReady = false;
  private seqInitPromise: Promise<void> | null = null;

  /**
   * Atomically generate the next ticket reference using a PostgreSQL sequence.
   * Guarantees uniqueness even under high concurrency (no TOCTOU race).
   */
  async nextReference(): Promise<string> {
    await this.ensureRefSequence();
    const [{ nextval }] = await this.prisma.$queryRaw<[{ nextval: bigint }]>`
      SELECT nextval('ticket_ref_seq')
    `;
    return `TK-${String(Number(nextval)).padStart(5, '0')}`;
  }

  /**
   * Create the ticket_ref_seq sequence (idempotent). Uses a JS-level
   * singleton promise to prevent concurrent initialization attempts.
   */
  private ensureRefSequence(): Promise<void> {
    if (this.seqReady) return Promise.resolve();
    if (!this.seqInitPromise) {
      this.seqInitPromise = this.initRefSequence();
    }
    return this.seqInitPromise;
  }

  private async initRefSequence(): Promise<void> {
    // CREATE SEQUENCE IF NOT EXISTS is atomic in PostgreSQL — safe under concurrency.
    await this.prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS ticket_ref_seq`,
    );
    // Initialize to current max only once (setval on an already-advanced
    // sequence is harmless — it just moves the pointer forward if needed).
    await this.prisma.$executeRawUnsafe(`
      SELECT setval('ticket_ref_seq', GREATEST(
        (SELECT last_value FROM ticket_ref_seq),
        COALESCE(
          (SELECT MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER))
           FROM "Ticket"
           WHERE reference ~ '[0-9]+$'),
          0
        )
      ))
    `);
    this.seqReady = true;
  }

}
