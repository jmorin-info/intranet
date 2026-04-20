import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ISO_CONTROLS_FR } from './iso-controls-fr.map';

@Injectable()
export class IsoControlsService {
  private controlsCache: { data: any[]; domain?: string; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Enrich a control record with its French title */
  private withFrenchTitle<T extends { code: string }>(control: T): T & { titleFr: string } {
    return { ...control, titleFr: ISO_CONTROLS_FR[control.code] || '' };
  }

  private invalidateCache() {
    this.controlsCache = null;
  }

  async findAll(domain?: string) {
    if (
      this.controlsCache &&
      Date.now() < this.controlsCache.expiresAt &&
      this.controlsCache.domain === domain
    ) {
      return this.controlsCache.data;
    }

    const where: any = {};
    if (domain) {
      where.domain = domain;
    }

    const data = await this.prisma.isoControl.findMany({
      where,
      include: {
        _count: {
          select: { documents: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    const enriched = data.map((c) => this.withFrenchTitle(c));
    this.controlsCache = { data: enriched, domain, expiresAt: Date.now() + 600000 }; // 10 min
    return enriched;
  }

  async findById(id: string) {
    const control = await this.prisma.isoControl.findUnique({
      where: { id },
      include: {
        documents: {
          include: {
            document: {
              select: {
                id: true,
                title: true,
                reference: true,
                status: true,
                category: true,
              },
            },
          },
        },
      },
    });

    if (!control) {
      throw new NotFoundException('ISO control not found');
    }

    return this.withFrenchTitle(control);
  }

  async getDomains() {
    const controls = await this.prisma.isoControl.findMany({
      select: { domain: true },
      distinct: ['domain'],
      orderBy: { domain: 'asc' },
    });

    return controls.map((c) => c.domain);
  }

  async create(data: { code: string; title: string; domain: string; description?: string }) {
    const result = await this.prisma.isoControl.create({ data });
    this.invalidateCache();
    return result;
  }

  async update(id: string, data: { title?: string; domain?: string; description?: string }) {
    const existing = await this.prisma.isoControl.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ISO control not found');
    const result = await this.prisma.isoControl.update({ where: { id }, data });
    this.invalidateCache();
    return result;
  }

  async remove(id: string) {
    const existing = await this.prisma.isoControl.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ISO control not found');
    // Remove document links first
    await this.prisma.documentIsoControl.deleteMany({ where: { isoControlId: id } });
    const result = await this.prisma.isoControl.delete({ where: { id } });
    this.invalidateCache();
    return result;
  }
}
