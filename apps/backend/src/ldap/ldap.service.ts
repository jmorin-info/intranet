import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { Client } from 'ldapts';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';

export interface LdapConfig {
  enabled: boolean;
  url: string;
  bindDN: string;           // svc_intranet@omnitech.security (UPN format)
  bindPassword: string;
  searchBase: string;       // dc=omnitech,dc=security
  searchFilter: string;     // (&(objectClass=user)(|(sAMAccountName={{username}})(userPrincipalName={{username}}@omnitech.security)))
  tlsRejectUnauthorized: boolean;
  emailAttribute: string;
  firstNameAttribute: string;
  lastNameAttribute: string;
  groupAttribute: string;
  roleMapping: Record<string, string>;
  defaultRole: string;
}

interface LdapUserInfo {
  email: string;
  firstName: string;
  lastName: string;
  department?: string;
  groups: string[];
  dn: string;
  jobTitle?: string;
  phone?: string;
  managerDN?: string;
}

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationsGateway?: NotificationsGateway,
  ) {}

  async getConfig(): Promise<LdapConfig> {
    const getVal = async (key: string, fallback: string) => {
      const config = await this.prisma.appConfig.findUnique({ where: { key } });
      return config?.value || process.env[key.toUpperCase().replace(/\./g, '_')] || fallback;
    };

    return {
      enabled: (await getVal('ldap.enabled', 'false')) === 'true',
      url: await getVal('ldap.url', ''),
      bindDN: await getVal('ldap.bind_dn', ''),
      bindPassword: await getVal('ldap.bind_password', ''),
      searchBase: await getVal('ldap.search_base', ''),
      searchFilter: await getVal('ldap.search_filter', '(&(objectClass=user)(sAMAccountName={{username}}))'),
      tlsRejectUnauthorized: (await getVal('ldap.tls_reject_unauthorized', 'false')) === 'true',
      emailAttribute: await getVal('ldap.attr_email', 'mail'),
      firstNameAttribute: await getVal('ldap.attr_firstname', 'givenName'),
      lastNameAttribute: await getVal('ldap.attr_lastname', 'sn'),
      groupAttribute: await getVal('ldap.attr_group', 'memberOf'),
      roleMapping: JSON.parse(await getVal('ldap.role_mapping', '{}')),
      defaultRole: await getVal('ldap.default_role', 'COLLABORATEUR'),
    };
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === retries) throw err;
        this.logger.warn(`LDAP attempt ${attempt} failed, retrying in ${delay * attempt}ms...`);
        await new Promise(r => setTimeout(r, delay * attempt));
      }
    }
    throw new Error('LDAP retry exhausted');
  }

  /**
   * Authenticate user via LDAPS.
   * 1. Bind with service account (UPN format: svc_intranet@omnitech.security)
   * 2. Search for user by sAMAccountName or UPN
   * 3. Re-bind as found user with their password
   */
  async authenticate(email: string, password: string): Promise<LdapUserInfo | null> {
    const config = await this.getConfig();
    if (!config.enabled) return null;

    return this.withRetry(() => this.ldapAuthenticate(email, password, config));
  }

  private createClient(config: LdapConfig): Client {
    // FIX: Build tlsOptions explicitly.
    // - rejectUnauthorized respects config (false by default for self-signed AD CAs)
    // - Optional CA bundle loaded from LDAP_CA_CERT_PATH so operators can pin a trusted cert
    //   without disabling verification completely.
    const tlsOptions: Record<string, unknown> = {
      rejectUnauthorized: config.tlsRejectUnauthorized,
    };
    const caPath = process.env.LDAP_CA_CERT_PATH;
    if (caPath) {
      try {
        tlsOptions.ca = fs.readFileSync(caPath);
        this.logger.debug(`LDAPS: loaded CA bundle from ${caPath}`);
      } catch (err) {
        // Non-fatal: log and fall back to rejectUnauthorized behaviour.
        this.logger.warn(`LDAPS: failed to read CA from ${caPath}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Warn explicitly if TLS verification is disabled — operators should know.
    if (!config.tlsRejectUnauthorized && config.url.startsWith('ldaps://')) {
      this.logger.debug('LDAPS: rejectUnauthorized=false (self-signed cert accepted). Set ldap.tls_reject_unauthorized=true + LDAP_CA_CERT_PATH in prod.');
    }

    return new Client({
      url: config.url,
      tlsOptions,
      // FIX: bumped to 15s per LDAPS best-practice — TLS handshake + bind over WAN can exceed 10s.
      connectTimeout: 15000,
      timeout: 15000,
    });
  }

  private async ldapAuthenticate(email: string, password: string, config: LdapConfig): Promise<LdapUserInfo | null> {
    // Extract username from email: retevenard@omnitech-security.fr -> retevenard
    const username = email.split('@')[0]!;

    const serviceClient = this.createClient(config);

    try {
      // Step 1: Bind with service account (UPN format)
      await serviceClient.bind(config.bindDN, config.bindPassword);
    } catch (err) {
      this.logger.warn(`LDAP service bind failed: ${err instanceof Error ? err.message : err}`);
      await this.safeUnbind(serviceClient);
      return null;
    }

    try {
      // Step 2: Search for user
      const filter = config.searchFilter.replace(/\{\{username\}\}/g, username);

      const { searchEntries } = await serviceClient.search(config.searchBase, {
        filter,
        scope: 'sub',
        attributes: [
          'dn', 'sAMAccountName', 'userPrincipalName',
          config.emailAttribute,
          config.firstNameAttribute,
          config.lastNameAttribute,
          config.groupAttribute,
          'department',
          'title',
          'telephoneNumber',
          'manager',
        ],
      });

      if (searchEntries.length === 0) {
        this.logger.debug(`LDAP user not found: ${username}`);
        await this.safeUnbind(serviceClient);
        return null;
      }

      const entry = searchEntries[0];
      const foundDN = entry.dn;

      const getAttr = (name: string): string => {
        const val = entry[name];
        if (Array.isArray(val)) return String(val[0] ?? '');
        return val != null ? String(val) : '';
      };
      const getMultiAttr = (name: string): string[] => {
        const val = entry[name];
        if (Array.isArray(val)) return val.map(String);
        return val != null ? [String(val)] : [];
      };

      const foundUser: LdapUserInfo = {
        email: getAttr(config.emailAttribute) || email,
        firstName: getAttr(config.firstNameAttribute),
        lastName: getAttr(config.lastNameAttribute),
        department: getAttr('department'),
        groups: getMultiAttr(config.groupAttribute),
        dn: foundDN,
        jobTitle: getAttr('title') || undefined,
        phone: getAttr('telephoneNumber') || undefined,
        managerDN: getAttr('manager') || undefined,
      };

      await this.safeUnbind(serviceClient);

      // Step 3: Re-bind as the user with their DN to verify password
      const userClient = this.createClient(config);
      try {
        await userClient.bind(foundDN, password);
        await this.safeUnbind(userClient);
        this.logger.log(`LDAP auth OK: ${username} (${foundUser.email})`);
        return foundUser;
      } catch (err) {
        this.logger.debug(`LDAP user bind failed for ${username}: ${err instanceof Error ? err.message : err}`);
        await this.safeUnbind(userClient);
        return null;
      }
    } catch (err) {
      this.logger.warn(`LDAP search failed: ${err instanceof Error ? err.message : err}`);
      await this.safeUnbind(serviceClient);
      return null;
    }
  }

  /**
   * Test the LDAP connection by binding with the service account and performing a base search.
   */
  async testConnection(config: LdapConfig): Promise<{ success: boolean; message: string; details?: string }> {
    const startTime = Date.now();
    const client = this.createClient(config);

    try {
      await client.bind(config.bindDN, config.bindPassword);
    } catch (err) {
      const duration = Date.now() - startTime;
      await this.safeUnbind(client);
      return {
        success: false,
        message: `Bind échoué : ${err instanceof Error ? err.message : err}`,
        details: `DN: ${config.bindDN} — ${duration}ms`,
      };
    }

    try {
      const { searchEntries } = await client.search(config.searchBase, {
        filter: '(objectClass=*)',
        scope: 'base',
      });

      const duration = Date.now() - startTime;
      await this.safeUnbind(client);

      return {
        success: true,
        message: searchEntries.length > 0
          ? `Connexion LDAPS réussie — bind et recherche OK`
          : `Bind OK — base de recherche vide ou inaccessible`,
        details: `URL: ${config.url} — Base: ${config.searchBase} — ${duration}ms`,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      await this.safeUnbind(client);
      return {
        success: true,
        message: `Bind OK mais recherche échouée : ${err instanceof Error ? err.message : err}`,
        details: `Base: ${config.searchBase} — ${duration}ms`,
      };
    }
  }

  /**
   * Sync ALL active users from LDAP/AD into local database.
   * - Searches AD with user_filter for all enabled accounts
   * - Creates new users as COLLABORATEUR (or role from group mapping)
   * - Updates existing users (name, role from groups)
   * - Deactivates local users not found in AD (optional)
   */
  async syncAllUsers(deactivateMissing = false): Promise<{
    created: number; updated: number; deactivated: number; errors: number; total: number;
  }> {
    const config = await this.getConfig();
    if (!config.enabled) throw new Error('LDAP is not enabled');

    const client = this.createClient(config);
    const stats: { created: number; updated: number; deactivated: number; errors: number; total: number; skipped: number } = {
      created: 0, updated: 0, deactivated: 0, errors: 0, total: 0, skipped: 0,
    };

    try {
      await client.bind(config.bindDN, config.bindPassword);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const code = (err as any)?.code;
      // FIX: log code + URL explicitly (never the password) so operators can diagnose
      // "invalid credentials" vs "cert issue" vs "network unreachable".
      this.logger.error(`LDAP bulk sync bind failed: ${detail} (code=${code ?? 'n/a'}, DN=${config.bindDN}, URL=${config.url})`);
      await this.safeUnbind(client);
      throw new Error(`Impossible de se connecter au serveur LDAP (${config.url}): ${detail}`);
    }

    try {
      // Fetch ALL active AD users
      const userFilter = await this.prisma.appConfig.findUnique({ where: { key: 'ldap.user_filter' } });
      const filter = userFilter?.value || '(&(objectCategory=Person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))';

      // FIX (root cause): Active Directory hard-caps search results at MaxPageSize=1000 server-side.
      // Passing sizeLimit:5000 without paging triggers a `size limit exceeded` error and aborts
      // the whole sync. ldapts supports paged results via `paged: true` — AD will then stream
      // results in pages of 1000 transparently. Do NOT set sizeLimit: let the server paginate.
      const { searchEntries } = await client.search(config.searchBase, {
        filter,
        scope: 'sub',
        attributes: [
          'dn', 'sAMAccountName', 'userPrincipalName',
          config.emailAttribute, config.firstNameAttribute,
          config.lastNameAttribute, config.groupAttribute,
          'department',
          'title',
          'telephoneNumber',
          'manager',
        ],
        paged: { pageSize: 1000 },
      });

      stats.total = searchEntries.length;
      this.logger.log(`LDAP bulk sync: found ${searchEntries.length} AD users`);

      const syncedEmails = new Set<string>();

      for (const entry of searchEntries) {
        try {
          const getAttr = (name: string): string => {
            const val = entry[name];
            if (Array.isArray(val)) return String(val[0] ?? '');
            return val != null ? String(val) : '';
          };
          const getMultiAttr = (name: string): string[] => {
            const val = entry[name];
            if (Array.isArray(val)) return val.map(String);
            return val != null ? [String(val)] : [];
          };

          // Résolution d'email avec fallback : les comptes AD fraîchement
          // créés n'ont parfois pas encore d'attribut `mail`. On tombe alors
          // sur `userPrincipalName` puis sur `sAMAccountName@<domaine>` dérivé
          // du searchBase. Sans ce fallback, les nouveaux utilisateurs étaient
          // silencieusement ignorés à chaque synchro.
          let email = getAttr(config.emailAttribute);
          if (!email || !email.includes('@')) {
            const upn = getAttr('userPrincipalName');
            if (upn && upn.includes('@')) {
              email = upn;
              this.logger.debug(`LDAP sync: fallback mail→userPrincipalName for ${entry.dn}`);
            } else {
              const sam = getAttr('sAMAccountName');
              // Dérive le domaine du searchBase (ex: DC=omnitech,DC=security → omnitech.security)
              const domain = (config.searchBase || '')
                .split(',')
                .filter((p) => p.toLowerCase().startsWith('dc='))
                .map((p) => p.slice(3))
                .join('.');
              if (sam && domain) {
                email = `${sam}@${domain}`;
                this.logger.debug(`LDAP sync: fallback mail→sAMAccountName@domain for ${entry.dn} → ${email}`);
              }
            }
          }
          if (!email || !email.includes('@')) {
            // Log EXPLICITE pour traçabilité — les comptes sans aucun identifiant
            // email reconnaissable sont exclus mais on garde la trace.
            const cn = getAttr('cn') || getAttr('displayName') || entry.dn;
            this.logger.warn(
              `LDAP sync: skipping entry without resolvable email: ${cn} (dn=${entry.dn})`,
            );
            stats.skipped = (stats.skipped || 0) + 1;
            continue;
          }

          const ldapUser: LdapUserInfo = {
            email,
            firstName: getAttr(config.firstNameAttribute),
            lastName: getAttr(config.lastNameAttribute),
            department: getAttr('department'),
            groups: getMultiAttr(config.groupAttribute),
            dn: entry.dn,
            jobTitle: getAttr('title') || undefined,
            phone: getAttr('telephoneNumber') || undefined,
            managerDN: getAttr('manager') || undefined,
          };

          // Check if user exists BEFORE sync to track create vs update
          const existingBefore = await this.prisma.user.findUnique({ where: { email } });
          if (existingBefore) {
            // Mise à jour standard du profil, rôle préservé.
            await this.syncUser(ldapUser, config);
            syncedEmails.add(email.toLowerCase());
            stats.updated++;
          } else {
            // NOUVEAU workflow : on ne crée plus directement l'utilisateur.
            // Il va dans la table `LdapPendingUser` pour qu'un admin choisisse
            // son département et son rôle avant de l'ajouter réellement.
            // Si une entrée PENDING existe déjà pour cet email, on la
            // rafraîchit avec les dernières données AD (lastSeenAt).
            // Vérifie si une entrée pending existe déjà et son statut
            const existingPending = await this.prisma.ldapPendingUser.findUnique({
              where: { email },
              select: { id: true, status: true },
            });

            if (existingPending && (existingPending.status === 'REJECTED' || existingPending.status === 'APPROVED')) {
              // L'admin a déjà pris une décision → on ne recrée PAS en PENDING.
              // On met juste à jour lastSeenAt pour le suivi AD.
              await this.prisma.ldapPendingUser.update({
                where: { email },
                data: {
                  lastSeenAt: new Date(),
                  dn: ldapUser.dn || null,
                },
              });
              syncedEmails.add(email.toLowerCase());
              stats.skipped++;
              this.logger.debug(`LDAP pending skip (already ${existingPending.status}): ${email}`);
            } else {
              // Nouvelle entrée OU entrée PENDING existante → upsert normal
              await this.prisma.ldapPendingUser.upsert({
                where: { email },
                create: {
                  email,
                  firstName: ldapUser.firstName || email.split('@')[0]!,
                  lastName: ldapUser.lastName || '',
                  jobTitle: ldapUser.jobTitle || null,
                  phone: ldapUser.phone || null,
                  adDepartment: ldapUser.department || null,
                  dn: ldapUser.dn || null,
                },
                update: {
                  firstName: ldapUser.firstName || undefined,
                  lastName: ldapUser.lastName || undefined,
                  jobTitle: ldapUser.jobTitle || null,
                  phone: ldapUser.phone || null,
                  adDepartment: ldapUser.department || null,
                  dn: ldapUser.dn || null,
                  lastSeenAt: new Date(),
                  // Ne touche PAS au status s'il est déjà PENDING
                },
              });
              syncedEmails.add(email.toLowerCase());
              stats.created++;
            }
          }
        } catch (err) {
          stats.errors++;
          this.logger.warn(`LDAP sync error for ${entry.dn}: ${err instanceof Error ? err.message : err}`);
        }
      }

      // Optionally deactivate users not found in AD
      if (deactivateMissing) {
        const localUsers = await this.prisma.user.findMany({
          where: { isActive: true, role: { not: 'SUPER_ADMIN' } },
          select: { id: true, email: true },
        });

        for (const localUser of localUsers) {
          if (!syncedEmails.has(localUser.email.toLowerCase())) {
            // Skip service accounts and prestataires
            if (localUser.email.includes('prestataire') || localUser.email.includes('svc_')) continue;

            await this.prisma.user.update({
              where: { id: localUser.id },
              data: { isActive: false },
            });
            stats.deactivated++;
            this.logger.log(`LDAP sync: deactivated ${localUser.email} (not in AD)`);
          }
        }
      }

      this.logger.log(`LDAP bulk sync complete: ${stats.created} created, ${stats.updated} updated, ${stats.deactivated} deactivated, ${stats.errors} errors, ${stats.skipped} skipped`);

      // Notifie les admins en temps réel si de nouveaux pending ont été détectés
      if (stats.created > 0 && this.notificationsGateway) {
        try {
          const pendingCount = await this.prisma.ldapPendingUser.count({
            where: { status: 'PENDING' },
          });
          this.notificationsGateway.broadcast('ldap-pending-new', {
            newDetected: stats.created,
            totalPending: pendingCount,
            at: new Date().toISOString(),
          });
        } catch (err) {
          this.logger.debug(`broadcast ldap-pending-new failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      // FIX: propagate an explicit, UI-friendly error (controller surfaces `err.message`).
      const detail = err instanceof Error ? err.message : String(err);
      const code = (err as any)?.code;
      this.logger.error(`LDAP bulk sync failed: ${detail} (code=${code ?? 'n/a'}, URL=${config.url}, base=${config.searchBase})`);
      throw new Error(`Sync LDAP échouée: ${detail}`);
    } finally {
      // FIX: unbind is guaranteed even if an unexpected throw happens above,
      // preventing socket leaks on the ldapts connection pool.
      await this.safeUnbind(client);
    }

    return stats;
  }

  private async safeUnbind(client: Client): Promise<void> {
    try {
      await client.unbind();
    } catch (e) {
      this.logger.debug(`LDAP unbind: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * Sync an LDAP user into the local database.
   */
  async syncUser(ldapUser: LdapUserInfo, cachedConfig?: LdapConfig): Promise<{ id: string; email: string; role: string }> {
    const config = cachedConfig || await this.getConfig();

    // Map AD groups to app role
    let role = config.defaultRole;
    for (const [groupPattern, mappedRole] of Object.entries(config.roleMapping)) {
      if (ldapUser.groups.some((g) => g.toLowerCase().includes(groupPattern.toLowerCase()))) {
        role = mappedRole;
        break;
      }
    }

    let user = await this.prisma.user.findUnique({ where: { email: ldapUser.email } });

    // Resolve managerId from manager DN if available
    let resolvedManagerId: string | undefined;
    if (ldapUser.managerDN) {
      try {
        // Extract email-like identifier from manager DN: CN=John Doe,OU=Users,DC=...
        // Best approach: look up user by matching DN pattern or search by name
        // We search for a user whose email domain matches and whose name is in the CN
        const cnMatch = ldapUser.managerDN.match(/^CN=([^,]+)/i);
        if (cnMatch) {
          const managerCN = cnMatch[1];
          // Try to find manager by name parts
          const nameParts = managerCN.split(' ');
          if (nameParts.length >= 2) {
            const managerUser = await this.prisma.user.findFirst({
              where: {
                isActive: true,
                firstName: { contains: nameParts[0], mode: 'insensitive' },
                lastName: { contains: nameParts[nameParts.length - 1], mode: 'insensitive' },
              },
              select: { id: true },
            });
            if (managerUser) resolvedManagerId = managerUser.id;
          }
        }
      } catch (err) {
        this.logger.debug(`Failed to resolve manager DN ${ldapUser.managerDN}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (user) {
      // IMPORTANT — politique de préservation des rôles :
      // Sur les utilisateurs déjà présents en base, on NE TOUCHE JAMAIS au rôle.
      // Les admins gèrent les rôles manuellement via /admin/users. AD ne sert
      // qu'à la création initiale et à la synchro des attributs de profil.
      const updateData: any = {
        firstName: ldapUser.firstName || user.firstName,
        lastName: ldapUser.lastName || user.lastName,
        // role: VOLONTAIREMENT ABSENT — ne pas écraser le rôle intranet.
        // Keep current isActive state — don't force reactivation of disabled accounts.
      };
      // Sync profile fields from AD (safe, non-role)
      if (ldapUser.jobTitle) updateData.jobTitle = ldapUser.jobTitle;
      if (ldapUser.phone) updateData.phone = ldapUser.phone;
      if (resolvedManagerId) updateData.managerId = resolvedManagerId;

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
      this.logger.log(
        `LDAP sync (update): ${user.email} → rôle préservé (${user.role}), AD aurait proposé ${role}`,
      );
    } else {
      const email = ldapUser.email;
      // Better fallback: try to extract from displayName or email
      const lastName = ldapUser.lastName
        || (ldapUser.firstName.includes(' ') ? ldapUser.firstName.split(' ').slice(1).join(' ').toUpperCase() : '')
        || email.split('@')[0]!.toUpperCase();
      const firstName = ldapUser.firstName.includes(' ')
        ? ldapUser.firstName.split(' ')[0]!
        : ldapUser.firstName || email.split('@')[0]!;

      const hash = await bcrypt.hash(`LDAP_${Date.now()}_${Math.random()}`, 10);
      user = await this.prisma.user.create({
        data: {
          email: ldapUser.email,
          firstName,
          lastName,
          passwordHash: hash,
          role: role as any,
          isActive: true,
          lastLoginAt: new Date(),
          gdprConsentAt: new Date(),
          gdprConsentIp: 'LDAP_SYNC',
          jobTitle: ldapUser.jobTitle || null,
          phone: ldapUser.phone || null,
          managerId: resolvedManagerId || null,
        },
      });
      this.logger.log(`LDAP sync (create): ${user.email} → ${role}`);
    }

    // Map AD department to local department — ONLY if user has no department assigned yet
    // This preserves manual department assignments made by admins on the intranet
    if (ldapUser.department && !user.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { name: { contains: ldapUser.department, mode: 'insensitive' } },
      });
      if (dept) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { departmentId: dept.id },
        });
        this.logger.debug(`LDAP dept mapping (initial): ${user.email} → ${dept.name}`);
      }
    }

    return { id: user.id, email: user.email, role: user.role };
  }

  // =========================================================================
  // Workflow "Pending users" — validation admin après détection LDAP
  // =========================================================================

  async listPendingUsers(status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL' = 'PENDING') {
    return this.prisma.ldapPendingUser.findMany({
      where: status === 'ALL' ? {} : { status },
      orderBy: { detectedAt: 'desc' },
      take: 200,
    });
  }

  async countPendingUsers(): Promise<number> {
    return this.prisma.ldapPendingUser.count({ where: { status: 'PENDING' } });
  }

  async approvePendingUser(
    pendingId: string,
    params: { departmentId?: string; role: string },
    adminId: string,
  ) {
    const pending = await this.prisma.ldapPendingUser.findUnique({ where: { id: pendingId } });
    if (!pending) {
      throw new Error('Demande introuvable');
    }
    if (pending.status !== 'PENDING') {
      throw new Error('Demande déjà traitée');
    }
    // Double-check : pas de doublon sur email
    const existing = await this.prisma.user.findUnique({ where: { email: pending.email } });
    if (existing) {
      await this.prisma.ldapPendingUser.update({
        where: { id: pendingId },
        data: {
          status: 'SUPERSEDED',
          processedById: adminId,
          processedAt: new Date(),
        },
      });
      throw new Error('Un utilisateur avec cet email existe déjà (demande marquée SUPERSEDED)');
    }
    const hash = await bcrypt.hash(`LDAP_${Date.now()}_${Math.random()}`, 10);
    const user = await this.prisma.user.create({
      data: {
        email: pending.email,
        firstName: pending.firstName,
        lastName: pending.lastName,
        passwordHash: hash,
        role: params.role as any,
        isActive: true,
        lastLoginAt: null,
        gdprConsentAt: new Date(),
        gdprConsentIp: 'LDAP_SYNC_APPROVED',
        jobTitle: pending.jobTitle,
        phone: pending.phone,
        departmentId: params.departmentId ?? null,
      },
    });
    await this.prisma.ldapPendingUser.update({
      where: { id: pendingId },
      data: {
        status: 'APPROVED',
        processedById: adminId,
        processedAt: new Date(),
      },
    });
    this.logger.log(
      `LDAP pending approved → created user ${user.email} role=${params.role} dept=${params.departmentId || 'none'} by admin=${adminId}`,
    );
    return user;
  }

  async rejectPendingUser(pendingId: string, reason: string, adminId: string) {
    const pending = await this.prisma.ldapPendingUser.findUnique({ where: { id: pendingId } });
    if (!pending) throw new Error('Demande introuvable');
    if (pending.status !== 'PENDING') throw new Error('Demande déjà traitée');
    await this.prisma.ldapPendingUser.update({
      where: { id: pendingId },
      data: {
        status: 'REJECTED',
        rejectReason: reason,
        processedById: adminId,
        processedAt: new Date(),
      },
    });
    this.logger.log(`LDAP pending rejected: ${pending.email} reason="${reason}" by admin=${adminId}`);
  }
}
