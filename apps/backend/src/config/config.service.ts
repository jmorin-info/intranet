import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AppConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.appConfig.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async findByKey(key: string) {
    return this.prisma.appConfig.findUnique({ where: { key } });
  }

  async upsert(key: string, value: string, description?: string, updatedById?: string) {
    // Fetch existing value for audit trail
    const existing = await this.prisma.appConfig.findUnique({ where: { key } });
    const oldValue = existing?.value ?? null;

    const result = await this.prisma.appConfig.upsert({
      where: { key },
      update: { value, updatedById, updatedAt: new Date() },
      create: { key, value, description: description || '', updatedById },
    });

    if (updatedById) {
      await this.audit.log({
        userId: updatedById,
        action: 'CONFIG_CHANGED',
        resourceType: 'AppConfig',
        resourceId: key,
        metadata: { key, oldValue, newValue: value },
        severity: 'WARN',
      });
    }

    return result;
  }
}
