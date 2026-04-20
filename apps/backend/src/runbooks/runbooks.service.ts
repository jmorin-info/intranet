import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RunbooksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: { isPublished?: boolean; category?: string; search?: string }) {
    const where: any = {};
    if (filters?.isPublished !== undefined) where.isPublished = filters.isPublished;
    if (filters?.category) where.category = filters.category;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.runbook.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        category: true,
        version: true,
        isPublished: true,
        createdAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findBySlug(slug: string) {
    const runbook = await this.prisma.runbook.findUnique({ where: { slug } });
    if (!runbook) throw new NotFoundException('Runbook not found');
    return runbook;
  }

  async findById(id: string) {
    const runbook = await this.prisma.runbook.findUnique({
      where: { id },
      include: { executions: { orderBy: { startedAt: 'desc' }, take: 10 } },
    });
    if (!runbook) throw new NotFoundException('Runbook not found');
    return runbook;
  }

  async create(data: {
    title: string;
    slug: string;
    description?: string;
    category?: string;
    content: string;
    authorId: string;
  }) {
    return this.prisma.runbook.create({
      data: { ...data, isPublished: true },
    });
  }

  async update(
    id: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      content?: string;
      isPublished?: boolean;
      version?: string;
    },
  ) {
    await this.findById(id);
    return this.prisma.runbook.update({ where: { id }, data });
  }

  async startExecution(runbookId: string, executorId: string) {
    await this.findById(runbookId);
    return this.prisma.runbookExecution.create({
      data: { runbookId, executorId, stepsData: '[]' },
    });
  }

  async updateExecution(executionId: string, stepsData: string, isComplete: boolean) {
    return this.prisma.runbookExecution.update({
      where: { id: executionId },
      data: {
        stepsData,
        isComplete,
        completedAt: isComplete ? new Date() : undefined,
      },
    });
  }

  async getExecutions(runbookId: string) {
    await this.findById(runbookId);
    return this.prisma.runbookExecution.findMany({
      where: { runbookId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
  }
}
