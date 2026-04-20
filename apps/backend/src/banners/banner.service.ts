import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BannerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns active, non-expired banners ordered by level (P1 first).
   */
  async getActiveBanners() {
    return this.prisma.banner.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ level: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Get all banners (admin view), including inactive.
   */
  async findAll() {
    return this.prisma.banner.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  /**
   * Create a new banner.
   */
  async create(data: {
    title: string;
    message: string;
    level?: string;
    expiresAt?: string;
    authorId?: string;
  }) {
    return this.prisma.banner.create({
      data: {
        title: data.title,
        message: data.message,
        level: data.level || 'P3',
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        authorId: data.authorId || null,
      },
    });
  }

  /**
   * Update a banner (partial).
   */
  async update(id: string, data: Partial<{ title: string; message: string; level: string; isActive: boolean; expiresAt: string | null }>) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner not found');

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.message !== undefined) updateData.message = data.message;
    if (data.level !== undefined) updateData.level = data.level;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

    return this.prisma.banner.update({ where: { id }, data: updateData });
  }

  /**
   * Dismiss a banner (set isActive=false).
   */
  async dismiss(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner not found');

    return this.prisma.banner.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Delete a banner permanently.
   */
  async remove(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner not found');

    return this.prisma.banner.delete({ where: { id } });
  }
}
