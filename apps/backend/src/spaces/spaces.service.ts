import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, ROLE_HIERARCHY } from '../common/enums';

/**
 * Canonical list of front-end modules addressable via the sidebar.
 * `alwaysOn` modules cannot be disabled (dashboard, notifications).
 */
export const AVAILABLE_MODULES = [
  // Mon espace
  { code: 'dashboard', label: 'Tableau de bord', alwaysOn: true },
  { code: 'notifications', label: 'Notifications', alwaysOn: true },
  { code: 'profile', label: 'Mon profil', alwaysOn: true },
  { code: 'tickets', label: 'Tickets / Helpdesk' },
  { code: 'signatures', label: 'Signatures électroniques' },
  { code: 'certificates', label: 'Certifications de formation' },
  { code: 'calendar', label: 'Calendrier' },
  { code: 'mfa', label: 'MFA / 2FA' },
  { code: 'media', label: 'Médiathèque (photos & vidéos)' },
  { code: 'testimonials', label: 'Avis / témoignages intranet' },
  // Travail & Connaissance
  { code: 'documents', label: 'GED Documents' },
  { code: 'procedures', label: 'Procédures' },
  { code: 'runbooks', label: 'Runbooks opérationnels' },
  { code: 'news', label: 'Actualités' },
  { code: 'wiki', label: 'Wiki / Base de connaissances' },
  { code: 'directory', label: 'Annuaire' },
  { code: 'files', label: 'Serveur de fichiers SMB' },
  { code: 'search', label: 'Recherche globale' },
  { code: 'quiz', label: 'Quiz sécurité' },
  { code: 'satisfaction', label: 'Enquêtes de satisfaction' },
  { code: 'tools', label: 'Outils PDF' },
  // Sécurité & Conformité
  { code: 'helpdesk', label: 'Support IT / Chatbot IA' },
  { code: 'veille', label: 'Veille cyber' },
  { code: 'alerts', label: 'Alertes sécurité' },
  { code: 'incidents', label: 'Gestion des incidents' },
  { code: 'chartes', label: 'Chartes & Politiques' },
  // Administration
  { code: 'admin', label: 'Administration' },
  { code: 'compliance', label: 'Conformité ISO 27001' },
  { code: 'workflows', label: "Workflows d'approbation" },
  { code: 'knowbe4', label: 'Intégration KnowBe4' },
  { code: 'it-exports', label: 'Exports IT & Conformité' },
  // Transversal
  { code: 'timeline', label: 'Timeline unifiée' },
  { code: 'changelog', label: "Journal des nouveautés" },
  { code: 'tips', label: 'Astuces & raccourcis' },
  { code: 'getting-started', label: "Guide d'accueil" },
  { code: 'extranet', label: 'Portail prestataires' },
  { code: 'annotations', label: 'Annotations collaboratives' },
] as const;

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
