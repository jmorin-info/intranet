import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, ROLE_HIERARCHY } from '../common/enums';

/**
 * Canonical list of front-end modules addressable via the sidebar.
 * `alwaysOn` modules cannot be disabled (dashboard, notifications).
 */
export const AVAILABLE_MODULES = [
  // Mon espace
  { code: 'dashboard', label: 'Tableau de bord', section: 'monEspace', alwaysOn: true },
  { code: 'notifications', label: 'Notifications', section: 'monEspace', alwaysOn: true },
  { code: 'profile', label: 'Mon profil', section: 'monEspace', alwaysOn: true },
  { code: 'tickets', label: 'Tickets / Helpdesk', section: 'monEspace' },
  { code: 'signatures', label: 'Signatures électroniques', section: 'monEspace' },
  { code: 'certificates', label: 'Certifications de formation', section: 'monEspace' },
  { code: 'calendar', label: 'Calendrier', section: 'monEspace' },
  { code: 'mfa', label: 'MFA / 2FA', section: 'monEspace' },
  { code: 'media', label: 'Médiathèque (photos & vidéos)', section: 'monEspace' },
  { code: 'testimonials', label: 'Avis / témoignages intranet', section: 'monEspace' },
  // Travail & Connaissance
  { code: 'documents', label: 'GED Documents', section: 'work' },
  { code: 'procedures', label: 'Procédures', section: 'work' },
  { code: 'runbooks', label: 'Runbooks opérationnels', section: 'work' },
  { code: 'news', label: 'Actualités', section: 'work' },
  { code: 'wiki', label: 'Wiki / Base de connaissances', section: 'work' },
  { code: 'directory', label: 'Annuaire', section: 'work' },
  { code: 'files', label: 'Serveur de fichiers SMB', section: 'work' },
  { code: 'search', label: 'Recherche globale', section: 'work' },
  { code: 'quiz', label: 'Quiz sécurité', section: 'work' },
  { code: 'satisfaction', label: 'Enquêtes de satisfaction', section: 'work' },
  { code: 'tools', label: 'Outils PDF', section: 'work' },
  // Sécurité & Conformité
  { code: 'helpdesk', label: 'Support IT / Chatbot IA', section: 'security' },
  { code: 'veille', label: 'Veille cyber', section: 'security' },
  { code: 'alerts', label: 'Alertes sécurité', section: 'security' },
  { code: 'incidents', label: 'Gestion des incidents', section: 'security' },
  { code: 'chartes', label: 'Chartes & Politiques', section: 'security' },
  // Administration
  { code: 'admin', label: 'Administration', section: 'admin' },
  { code: 'compliance', label: 'Conformité ISO 27001', section: 'admin' },
  { code: 'workflows', label: "Workflows d'approbation", section: 'admin' },
  { code: 'knowbe4', label: 'Intégration KnowBe4', section: 'admin' },
  { code: 'it-exports', label: 'Exports IT & Conformité', section: 'admin' },
  // Transversal
  { code: 'timeline', label: 'Timeline unifiée', section: 'transverse' },
  { code: 'changelog', label: "Journal des nouveautés", section: 'transverse' },
  { code: 'tips', label: 'Astuces & raccourcis', section: 'transverse' },
  { code: 'getting-started', label: "Guide d'accueil", section: 'transverse' },
  { code: 'extranet', label: 'Portail prestataires', section: 'transverse' },
  { code: 'annotations', label: 'Annotations collaboratives', section: 'transverse' },
] as const;

export const MODULE_SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'monEspace', label: 'Mon espace' },
  { id: 'work', label: 'Travail & connaissance' },
  { id: 'security', label: 'Sécurité & conformité' },
  { id: 'admin', label: 'Administration' },
  { id: 'transverse', label: 'Transversal' },
];

export type AvailableModule = (typeof AVAILABLE_MODULES)[number]['code'];

const VALID_SCOPES = ['GLOBAL', 'DEPARTMENT', 'ROLE', 'USER'] as const;
export type SpaceScopeType = (typeof VALID_SCOPES)[number];

const VALID_ROLES: string[] = Object.values(UserRole);

interface SetConfigInput {
  module: string;
  scopeType: SpaceScopeType;
  scopeValue?: string | null;
  enabled: boolean;
  config?: any;
}

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);

  constructor(private readonly prisma: PrismaService) {}

  getDefaultModules() {
    return AVAILABLE_MODULES;
  }

  async getAllConfigs() {
    return this.prisma.spaceAccessConfig.findMany({
      orderBy: [{ module: 'asc' }, { scopeType: 'asc' }],
    });
  }

  /**
   * Returns the list of module codes accessible to a given user.
   *
   * Resolution rules:
   *  - alwaysOn modules are always returned;
   *  - by default every module is enabled, unless a GLOBAL rule disables it;
   *  - a DEPARTMENT rule for the user's department overrides GLOBAL;
   *  - a ROLE rule for the user's role overrides DEPARTMENT;
   *  - SUPER_ADMIN and ADMIN always see the `admin` module even if disabled.
   */
  async getModulesForUser(user: {
    id: string;
    role: string;
    departmentId?: string | null;
  }): Promise<string[]> {
    const configs = await this.prisma.spaceAccessConfig.findMany();

    const role = user.role as UserRole;
    const isAdmin = ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.ADMIN];

    const accessible: string[] = [];

    for (const mod of AVAILABLE_MODULES) {
      // Start with "enabled by default"
      let enabled = true;

      const globalCfg = configs.find(
        (c: any) => c.module === mod.code && c.scopeType === 'GLOBAL',
      );
      if (globalCfg) enabled = globalCfg.enabled;

      const deptCfg = user.departmentId
        ? configs.find(
            (c: any) =>
              c.module === mod.code &&
              c.scopeType === 'DEPARTMENT' &&
              c.scopeValue === user.departmentId,
          )
        : undefined;
      if (deptCfg) enabled = deptCfg.enabled;

      const roleCfg = configs.find(
        (c: any) =>
          c.module === mod.code &&
          c.scopeType === 'ROLE' &&
          c.scopeValue === user.role,
      );
      if (roleCfg) enabled = roleCfg.enabled;

      // USER-level override takes highest priority
      const userCfg = configs.find(
        (c: any) =>
          c.module === mod.code &&
          c.scopeType === 'USER' &&
          c.scopeValue === user.id,
      );
      if (userCfg) enabled = userCfg.enabled;

      // Always-on modules cannot be disabled
      if ((mod as any).alwaysOn) enabled = true;

      // Admins always see the admin module
      if (mod.code === 'admin' && isAdmin) enabled = true;

      if (enabled) accessible.push(mod.code);
    }

    return accessible;
  }

  async setConfig(input: SetConfigInput) {
    if (!VALID_SCOPES.includes(input.scopeType)) {
      throw new BadRequestException(`Invalid scopeType: ${input.scopeType}`);
    }
    if (!AVAILABLE_MODULES.some((m) => m.code === input.module)) {
      throw new BadRequestException(`Unknown module: ${input.module}`);
    }
    if (input.scopeType === 'GLOBAL' && input.scopeValue) {
      throw new BadRequestException('GLOBAL scope must not have scopeValue');
    }
    if (input.scopeType !== 'GLOBAL' && !input.scopeValue) {
      throw new BadRequestException(
        `${input.scopeType} scope requires scopeValue`,
      );
    }
    if (input.scopeType === 'ROLE' && !VALID_ROLES.includes(input.scopeValue!)) {
      throw new BadRequestException(`Invalid role: ${input.scopeValue}`);
    }

    // Prisma compound unique with a nullable column requires upsert via
    // findFirst + update/create — the upsert variant with a null `scopeValue`
    // is rejected by Prisma's generated types.
    const existing = await this.prisma.spaceAccessConfig.findFirst({
      where: {
        module: input.module,
        scopeType: input.scopeType,
        scopeValue: input.scopeValue ?? null,
      },
    });

    if (existing) {
      return this.prisma.spaceAccessConfig.update({
        where: { id: existing.id },
        data: {
          enabled: input.enabled,
          config: input.config ?? null,
        },
      });
    }

    return this.prisma.spaceAccessConfig.create({
      data: {
        module: input.module,
        scopeType: input.scopeType,
        scopeValue: input.scopeValue ?? null,
        enabled: input.enabled,
        config: input.config ?? null,
      },
    });
  }

  async deleteConfig(id: string) {
    await this.prisma.spaceAccessConfig.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ── User-level module overrides ──────────────────────────────────

  async getConfigsForUser(userId: string) {
    const configs = await this.prisma.spaceAccessConfig.findMany({
      where: { scopeType: 'USER', scopeValue: userId },
    });
    return configs;
  }

  async setUserModuleOverrides(userId: string, modules: string[]) {
    // Validate module codes
    const validCodes = AVAILABLE_MODULES.map((m) => m.code);
    for (const mod of modules) {
      if (!validCodes.includes(mod as AvailableModule)) {
        throw new BadRequestException(`Unknown module: ${mod}`);
      }
    }

    // Remove all existing USER overrides for this user
    await this.prisma.spaceAccessConfig.deleteMany({
      where: { scopeType: 'USER', scopeValue: userId },
    });

    // Create enabled overrides for requested modules
    if (modules.length > 0) {
      await this.prisma.spaceAccessConfig.createMany({
        data: modules.map((mod) => ({
          module: mod,
          scopeType: 'USER',
          scopeValue: userId,
          enabled: true,
        })),
      });
    }

    this.logger.log(`User module overrides set for ${userId}: ${modules.join(', ')}`);
    return { userId, modules };
  }
}
