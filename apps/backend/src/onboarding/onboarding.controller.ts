import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '../common/enums';

const ONBOARDING_TEMPLATE = [
  { stepName: 'Compte AD créé', description: 'Création du compte Active Directory et configuration email', order: 1 },
  { stepName: 'Matériel assigné', description: 'PC portable, écran, périphériques', order: 2 },
  { stepName: 'Accès VPN configuré', description: 'Configuration du VPN SSL', order: 3 },
  { stepName: 'Formation sécurité', description: 'Sensibilisation sécurité obligatoire (A.6.3)', order: 4 },
  { stepName: 'Chartes signées', description: 'PSSI et charte informatique signées sur l\'intranet', order: 5 },
  { stepName: 'MFA activé', description: 'Double authentification configurée', order: 6 },
  { stepName: 'Badge accès remis', description: 'Badge physique pour les locaux', order: 7 },
  { stepName: 'Présentation équipe', description: 'Tour des équipes et présentation du poste', order: 8 },
];

const OFFBOARDING_TEMPLATE = [
  { stepName: 'Comptes désactivés', description: 'AD, email, VPN, intranet', order: 1 },
  { stepName: 'Matériel restitué', description: 'PC, badge, périphériques', order: 2 },
  { stepName: 'Données archivées', description: 'Sauvegarde et archivage des données', order: 3 },
  { stepName: 'Accès physiques révoqués', description: 'Badge et codes d\'accès', order: 4 },
  { stepName: 'Entretien de sortie', description: 'Entretien avec RH', order: 5 },
];

@Controller('onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OnboardingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post(':userId/start')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async startOnboarding(@Param('userId') userId: string, @Body('type') type: string) {
    const template = type === 'OFFBOARDING' ? OFFBOARDING_TEMPLATE : ONBOARDING_TEMPLATE;
    const stepType = type === 'OFFBOARDING' ? 'OFFBOARDING' : 'ONBOARDING';

    // Delete existing steps
    await this.prisma.onboardingStep.deleteMany({ where: { userId, stepType } });

    // Create new steps
    await this.prisma.onboardingStep.createMany({
      data: template.map(s => ({ userId, stepType, ...s })),
    });

    // Notify the user
    await this.notificationsService.create({
      userId: userId,
      type: 'ACK_REQUIRED',
      title: type === 'ONBOARDING' ? 'Bienvenue ! Votre onboarding a commencé' : 'Procédure de départ initiée',
      body: `${template.length} étapes à compléter. Consultez votre espace dans l'intranet.`,
      resourceType: 'Onboarding',
    });

    return { message: `${stepType} lance avec ${template.length} etapes`, steps: template.length };
  }

  @Get(':userId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSteps(@Param('userId') userId: string, @Query('type') type: string) {
    return this.prisma.onboardingStep.findMany({
      where: { userId, ...(type ? { stepType: type } : {}) },
      orderBy: { order: 'asc' },
    });
  }

  @Patch('steps/:stepId/complete')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async completeStep(@Param('stepId') stepId: string, @Body('completedBy') completedBy: string) {
    return this.prisma.onboardingStep.update({
      where: { id: stepId },
      data: { isCompleted: true, completedAt: new Date(), completedBy },
    });
  }

  @Get('pending/all')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getPending() {
    const steps = await this.prisma.onboardingStep.findMany({
      where: { isCompleted: false },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: [{ userId: 'asc' }, { order: 'asc' }],
    });

    // Group by user
    const grouped = new Map<string, { user: any; steps: typeof steps }>();
    for (const step of steps) {
      const key = step.userId;
      if (!grouped.has(key)) {
        grouped.set(key, { user: step.user, steps: [] });
      }
      grouped.get(key)!.steps.push(step);
    }

    return Array.from(grouped.values());
  }
}
