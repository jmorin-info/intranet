import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ComplianceTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(status?: string, overdue?: boolean) {
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (overdue) {
      where.nextDueDate = { lt: new Date() };
      where.status = { not: 'COMPLETED' };
    }

    return this.prisma.complianceTask.findMany({
      where,
      orderBy: [{ nextDueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(data: {
    title: string;
    description?: string;
    frequency?: string;
    responsibleId?: string;
    status?: string;
    nextDueDate?: string;
    isoControl?: string;
  }) {
    return this.prisma.complianceTask.create({
      data: {
        title: data.title,
        description: data.description || null,
        frequency: data.frequency || 'ANNUAL',
        responsibleId: data.responsibleId || null,
        status: data.status || 'TODO',
        nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : null,
        isoControl: data.isoControl || null,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      title: string;
      description: string;
      frequency: string;
      responsibleId: string;
      status: string;
      nextDueDate: string;
      isoControl: string;
    }>,
  ) {
    const task = await this.prisma.complianceTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Compliance task not found');

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.frequency !== undefined) updateData.frequency = data.frequency;
    if (data.responsibleId !== undefined) updateData.responsibleId = data.responsibleId;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.nextDueDate !== undefined)
      updateData.nextDueDate = data.nextDueDate ? new Date(data.nextDueDate) : null;
    if (data.isoControl !== undefined) updateData.isoControl = data.isoControl;

    return this.prisma.complianceTask.update({ where: { id }, data: updateData });
  }

  async completeTask(id: string) {
    const task = await this.prisma.complianceTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Compliance task not found');

    const now = new Date();
    const nextDueDate = this.calculateNextDueDate(task.frequency, now);

    return this.prisma.complianceTask.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        lastCompletedAt: now,
        nextDueDate,
      },
    });
  }

  async getOverdue() {
    return this.prisma.complianceTask.findMany({
      where: {
        nextDueDate: { lt: new Date() },
        status: { not: 'COMPLETED' },
      },
      orderBy: { nextDueDate: 'asc' },
    });
  }

  async seed() {
    const tasks = [
      { title: 'Revue PSSI et politiques de sécurité', frequency: 'ANNUAL', isoControl: 'A.5.1' },
      { title: 'Tests de restauration VM (Veeam)', frequency: 'QUARTERLY', isoControl: 'A.8.13' },
      { title: 'Revue des accès et habilitations', frequency: 'QUARTERLY', isoControl: 'A.5.18' },
      { title: 'Test PCA/PRA', frequency: 'ANNUAL', isoControl: 'A.5.30' },
      { title: 'Audit interne ISO 27001', frequency: 'ANNUAL', isoControl: 'A.5.35' },
      { title: 'Revue règles firewall FortiGate', frequency: 'QUARTERLY', isoControl: 'A.8.20' },
      { title: 'Sauvegarde configs Switch/Firewall', frequency: 'MONTHLY', isoControl: 'A.8.13' },
      { title: 'Sensibilisation sécurité collaborateurs', frequency: 'SEMI_ANNUAL', isoControl: 'A.6.3' },
      { title: 'Revue des accès prestataires', frequency: 'MONTHLY', isoControl: 'A.5.19' },
      { title: 'Mise à jour inventaire des actifs', frequency: 'SEMI_ANNUAL', isoControl: 'A.5.9' },
    ];

    const existing = await this.prisma.complianceTask.count();
    if (existing > 0) return { seeded: false, message: 'Tasks already exist' };

    const now = new Date();
    for (const t of tasks) {
      const nextDueDate = this.calculateNextDueDate(t.frequency, now);
      await this.prisma.complianceTask.create({
        data: {
          title: t.title,
          frequency: t.frequency,
          isoControl: t.isoControl,
          nextDueDate,
          status: 'TODO',
        },
      });
    }

    return { seeded: true, count: tasks.length };
  }

  private calculateNextDueDate(frequency: string, fromDate: Date): Date {
    const next = new Date(fromDate);
    switch (frequency) {
      case 'MONTHLY':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'QUARTERLY':
        next.setMonth(next.getMonth() + 3);
        break;
      case 'SEMI_ANNUAL':
        next.setMonth(next.getMonth() + 6);
        break;
      case 'ANNUAL':
        next.setFullYear(next.getFullYear() + 1);
        break;
      case 'ONE_TIME':
      default:
        // No recurrence — keep same date
        break;
    }
    return next;
  }
}
