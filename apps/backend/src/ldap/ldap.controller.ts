import { Controller, Get, Post, Body, Query, UseGuards, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { LdapService } from './ldap.service';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Controller('ldap')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LdapController {
  private readonly logger = new Logger(LdapController.name);

  constructor(
    private readonly ldapService: LdapService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Get current LDAP configuration (passwords masked)
   */
  @Get('config')
  @Roles(UserRole.SUPER_ADMIN)
  async getConfig() {
    const config = await this.ldapService.getConfig();
    return {
      ...config,
      bindPassword: config.bindPassword ? '********' : '',
    };
  }

  /**
   * Test LDAP connection — tries to bind with the service account
   */
  @Post('test-connection')
  @Roles(UserRole.SUPER_ADMIN)
  async testConnection(@CurrentUser() user: RequestUser) {
    const config = await this.ldapService.getConfig();

    if (!config.enabled) {
      return { success: false, message: 'LDAPS est désactivé. Activez-le dans Configuration > LDAPS.' };
    }

    if (!config.url || !config.bindDN || !config.bindPassword) {
      return { success: false, message: 'Configuration LDAP incomplete : URL, Bind DN et mot de passe requis.' };
    }

    const result = await this.ldapService.testConnection(config);

    await this.auditService.log({
      userId: user.id,
      action: 'LDAP_TEST_CONNECTION',
      resourceType: 'config',
      resourceId: 'ldap',
      severity: result.success ? 'INFO' : 'WARN',
      metadata: { success: result.success, message: result.message },
    });

    return result;
  }

  /**
   * Endpoint diagnostic — retourne l'état complet de la config LDAP pour debug
   */
  @Get('diagnostic')
  @Roles(UserRole.SUPER_ADMIN)
  async diagnostic() {
    const config = await this.ldapService.getConfig();
    const issues: string[] = [];

    if (!config.enabled) issues.push('LDAPS désactivé (ldap.enabled=false)');
    if (!config.url) issues.push('URL LDAPS manquante (ldap.url vide)');
    else if (!config.url.startsWith('ldaps://') && !config.url.startsWith('ldap://')) {
      issues.push(`URL invalide : doit commencer par ldaps:// ou ldap:// (actuel : ${config.url})`);
    }
    if (!config.bindDN) issues.push('Bind DN manquant (ldap.bind_dn vide)');
    if (!config.bindPassword) issues.push('Bind password manquant (ldap.bind_password vide)');
    if (!config.searchBase) issues.push('Search base manquant (ldap.search_base vide)');
    if (!config.searchFilter || !config.searchFilter.includes('{{username}}')) {
      issues.push('Search filter invalide : doit contenir {{username}}');
    }

    let connectionTest = null;
    if (issues.length === 0) {
      connectionTest = await this.ldapService.testConnection(config);
    }

    return {
      ready: issues.length === 0,
      config: {
        enabled: config.enabled,
        url: config.url || '(vide)',
        bindDN: config.bindDN || '(vide)',
        bindPassword: config.bindPassword ? `(${config.bindPassword.length} chars)` : '(vide)',
        searchBase: config.searchBase || '(vide)',
        searchFilter: config.searchFilter || '(vide)',
        tlsRejectUnauthorized: config.tlsRejectUnauthorized,
        emailAttribute: config.emailAttribute,
        firstNameAttribute: config.firstNameAttribute,
        lastNameAttribute: config.lastNameAttribute,
        groupAttribute: config.groupAttribute,
        defaultRole: config.defaultRole,
        roleMapping: config.roleMapping,
      },
      issues,
      connectionTest,
      recommendations: issues.length > 0
        ? [
            'Aller dans Admin > Configuration > LDAPS et compléter les champs manquants',
            'Tester la connectivité réseau au serveur LDAPS depuis le serveur intranet',
            'Vérifier que le compte de service AD a les droits de lecture sur la base',
          ]
        : [
            'Configuration LDAP semble OK. Si la sync échoue, vérifier les logs backend.',
            'Pour tester un user précis : POST /api/ldap/test-auth { email, password }',
            'Pour la sync complète : POST /api/ldap/sync-all',
          ],
    };
  }

  /**
   * Test authentication of a specific user via LDAP
   */
  @Post('test-auth')
  @Roles(UserRole.SUPER_ADMIN)
  async testAuth(
    @Body() body: { email: string; password: string },
    @CurrentUser() user: RequestUser,
  ) {
    const config = await this.ldapService.getConfig();
    if (!config.enabled) {
      return { success: false, message: 'LDAPS désactivé' };
    }

    const ldapUser = await this.ldapService.authenticate(body.email, body.password);

    if (!ldapUser) {
      return { success: false, message: `Authentification échouée pour ${body.email}` };
    }

    return {
      success: true,
      message: `Authentification réussie`,
      user: {
        email: ldapUser.email,
        firstName: ldapUser.firstName,
        lastName: ldapUser.lastName,
        groups: ldapUser.groups.length,
        department: ldapUser.department,
      },
    };
  }

  /**
   * Manually trigger sync of an LDAP user into the local database
   */
  @Post('sync-user')
  @Roles(UserRole.SUPER_ADMIN)
  async syncUser(
    @Body() body: { email: string; password: string },
    @CurrentUser() user: RequestUser,
  ) {
    const config = await this.ldapService.getConfig();
    if (!config.enabled) {
      return { success: false, message: 'LDAPS désactivé' };
    }

    const ldapUser = await this.ldapService.authenticate(body.email, body.password);
    if (!ldapUser) {
      return { success: false, message: `Impossible d'authentifier ${body.email} via LDAP` };
    }

    const synced = await this.ldapService.syncUser(ldapUser);

    await this.auditService.log({
      userId: user.id,
      action: 'LDAP_USER_SYNCED',
      resourceType: 'User',
      resourceId: synced.id,
      metadata: { email: synced.email, role: synced.role },
    });

    return { success: true, message: `Utilisateur synchronise`, user: synced };
  }

  /**
   * Bulk sync: import ALL active AD users into the intranet.
   * Creates new users (role = defaultRole côté AppConfig). Updates existing
   * users sur firstName/lastName/jobTitle/phone/managerId UNIQUEMENT — le rôle
   * et le statut isActive sont préservés (géré manuellement depuis /admin/users).
   *
   * IMPORTANT: cet endpoint garantit un retour JSON structuré même en cas
   * d'erreur (jamais de 400 avec body null ou HTML). Le body de requête est
   * optionnel — le frontend peut envoyer `{}`.
   */
  @Post('sync-all')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async syncAll(
    @Query('deactivateMissing') deactivateMissing: string,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const config = await this.ldapService.getConfig();
      if (!config.enabled) {
        return { success: false, message: 'LDAPS désactivé. Activez-le dans Configuration > LDAPS.' };
      }
      if (!config.url || !config.bindDN || !config.bindPassword || !config.searchBase) {
        return {
          success: false,
          message: 'Configuration LDAP incomplète (URL, Bind DN, password ou search base manquant).',
        };
      }

      const stats = await this.ldapService.syncAllUsers(deactivateMissing === 'true');

      await this.auditService.log({
        userId: user.id,
        action: 'LDAP_BULK_SYNC',
        resourceType: 'User',
        severity: 'WARN',
        metadata: stats,
      });

      return {
        success: true,
        message: `Synchronisation terminée : ${stats.created} créés, ${stats.updated} mis à jour, ${stats.deactivated} désactivés, ${stats.errors} erreurs (${stats.total} comptes AD trouvés). Les rôles des utilisateurs existants ont été préservés.`,
        stats,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`LDAP sync-all failed: ${msg}`);
      // Toujours retourner un JSON parseable — jamais throw (qui produit un 400/500 avec body non-JSON)
      return {
        success: false,
        message: `Erreur de synchronisation : ${msg}`,
      };
    }
  }

  /**
   * Automatic nightly LDAP sync (2:30 AM)
   * Creates/updates all AD users, does NOT deactivate missing users automatically
   */
  @Cron('30 2 * * *')
  async scheduledSync() {
    try {
      const config = await this.ldapService.getConfig();
      if (!config.enabled) return;

      // First sync WITHOUT deactivation to get the count
      const stats = await this.ldapService.syncAllUsers(false);

      // Only deactivate missing users if AD returned a reasonable number (safety guard)
      // Prevents mass deactivation if AD is temporarily unreachable
      if (stats.total >= 10) {
        const deactStats = await this.ldapService.syncAllUsers(true);
        stats.deactivated = deactStats.deactivated;
      }

      this.auditService.log({
        action: 'LDAP_SCHEDULED_SYNC',
        resourceType: 'User',
        severity: 'INFO',
        metadata: stats,
      });
    } catch (err) {
      this.auditService.log({
        action: 'LDAP_SCHEDULED_SYNC_FAILED',
        resourceType: 'User',
        severity: 'CRITICAL',
        metadata: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  // ===========================================================================
  // Workflow "Pending users" — validation admin des nouveaux comptes LDAP
  // ===========================================================================

  /**
   * Liste les utilisateurs AD détectés lors de la dernière synchro
   * qui ne sont pas encore validés (ou filtrer par statut).
   */
  @Get('pending')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listPending(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL') {
    const items = await this.ldapService.listPendingUsers(status || 'PENDING');
    return { data: items, count: items.length };
  }

  /**
   * Compteur rapide pour le badge du menu admin.
   */
  @Get('pending/count')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async countPending() {
    const count = await this.ldapService.countPendingUsers();
    return { count };
  }

  /**
   * Approuver un utilisateur pending : l'admin choisit département + rôle.
   * L'utilisateur est alors créé dans la table User et devient actif.
   */
  @Post('pending/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async approvePending(
    @CurrentUser() admin: RequestUser,
    @Body() body: { pendingId: string; departmentId?: string; role: string },
  ) {
    try {
      const created = await this.ldapService.approvePendingUser(
        body.pendingId,
        { departmentId: body.departmentId, role: body.role },
        admin.id,
      );
      this.auditService.log({
        action: 'LDAP_PENDING_APPROVED',
        resourceType: 'User',
        resourceId: created.id,
        userId: admin.id,
        severity: 'INFO',
        metadata: {
          email: created.email,
          role: body.role,
          departmentId: body.departmentId,
        },
      });
      return { success: true, userId: created.id };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Rejeter une demande pending avec une raison (pour l'audit).
   */
  @Post('pending/:id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async rejectPending(
    @CurrentUser() admin: RequestUser,
    @Body() body: { pendingId: string; reason: string },
  ) {
    try {
      await this.ldapService.rejectPendingUser(body.pendingId, body.reason, admin.id);
      this.auditService.log({
        action: 'LDAP_PENDING_REJECTED',
        resourceType: 'LdapPendingUser',
        resourceId: body.pendingId,
        userId: admin.id,
        severity: 'INFO',
        metadata: { reason: body.reason },
      });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
