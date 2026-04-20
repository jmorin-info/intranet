import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SavedFiltersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, module?: string) {
    return this.prisma.savedFilter.findMany({
      where: {
        userId,
        ...(module ? { module } : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, data: { module: string; name: string; filters: any; isDefault?: boolean }) {
    // If setting as default, unset any existing default for this user+module
    if (data.isDefault) {
      await this.prisma.savedFilter.updateMany({
        where: { userId, module: data.module, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedFilter.create({
      data: {
        userId,
        module: data.module,
        name: data.name,
        filters: data.filters,
        isDefault: data.isDefault ?? false,
      },
    });
  }

  async update(id: string, userId: string, data: { name?: string; isDefault?: boolean }) {
    const filter = await this.prisma.savedFilter.findUnique({ where: { id } });
    if (!filter) throw new NotFoundException('Filtre non trouvé');
    if (filter.userId !== userId) throw new ForbiddenException();

    // If setting as default, unset any existing default for this user+module
    if (data.isDefault) {
      await this.prisma.savedFilter.updateMany({
        where: { userId, module: filter.module, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedFilter.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, userId: string) {
    const filter = await this.prisma.savedFilter.findUnique({ where: { id } });
    if (!filter) throw new NotFoundException('Filtre non trouvé');
    if (filter.userId !== userId) throw new ForbiddenException();

    return this.prisma.savedFilter.delete({ where: { id } });
  }
}
