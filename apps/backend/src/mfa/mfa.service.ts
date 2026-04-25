import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LdapService } from "../ldap/ldap.service";
import { generateSecret, generateURI, verifySync } from "otplib";
import * as QRCode from "qrcode";
import * as crypto from "crypto";

/**
 * MFA Service — TOTP via otplib v13 (async API).
 * ISO 27001 A.8.5 — Secure Authentication.
 * ISO 27001 A.12.4 — toutes les actions MFA écrivent dans AuditLog (severity WARN).
 *
 * IMPORTANT: otplib v13 expose toutes ses fonctions en async (Promise).
 * Tout appel sans `await` retourne une Promise non résolue → secret invalide.
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly ldapService: LdapService,
  ) {}

  /** Génère un nouveau secret TOTP et un QR code. */
  async setupMfa(userId: string, ctx?: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException("User not found");

    const secret = await generateSecret();
    const otpAuthUrl = await generateURI({
      secret,
      issuer: "OMNITECH Security",
      label: user.email,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    this.auditService
      .log({
        userId,
        ipAddress: ctx?.ip,
        userAgent: ctx?.userAgent,
        action: "MFA_SETUP",
        resourceType: "User",
        resourceId: userId,
        metadata: { replacedPreviousSecret: !!user.mfaSecret },
        severity: "WARN",
      })
      .catch((err) =>
        this.logger.error(`Audit log failed (MFA_SETUP): ${err.message}`),
      );

    return { secret, qrCodeDataUrl, otpAuthUrl };
  }

  async activateMfa(
    userId: string,
    code: string,
    ctx?: { ip?: string; userAgent?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecret) throw new BadRequestException("MFA not configured");

    const result = await verifySync({ token: code, secret: user.mfaSecret });
    if (!result?.valid) {
      this.logger.warn(`Invalid MFA activation code for user ${userId}`);
      this.auditService
        .log({
          userId,
          ipAddress: ctx?.ip,
          userAgent: ctx?.userAgent,
          action: "MFA_ACTIVATE_FAILED",
          resourceType: "User",
          resourceId: userId,
          metadata: { reason: "invalid_totp_code" },
          severity: "WARN",
        })
        .catch((err) =>
          this.logger.error(
            `Audit log failed (MFA_ACTIVATE_FAILED): ${err.message}`,
          ),
        );
      throw new BadRequestException("Code TOTP invalide");
    }

    await this.prisma.user.update({
      where: { id: userId },
      // Une fois activé, on lève automatiquement la politique mfaRequired
      // (l'utilisateur s'est conformé, plus besoin de le bloquer au login).
      data: { mfaEnabled: true, mfaRequired: false },
    });

    this.logger.log(`MFA activated for user ${userId}`);
    this.auditService
      .log({
        userId,
        ipAddress: ctx?.ip,
        userAgent: ctx?.userAgent,
        action: "MFA_ACTIVATED",
        resourceType: "User",
        resourceId: userId,
        severity: "WARN",
      })
      .catch((err) =>
        this.logger.error(`Audit log failed (MFA_ACTIVATED): ${err.message}`),
      );

    return { message: "MFA activé avec succès" };
  }

  async verifyMfa(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // If MFA not enabled, skip verification (handled by login flow)
    if (!user?.mfaEnabled || !user.mfaSecret) return true;
    // Verify TOTP code (with backup code fallback)
    const result = await verifySync({ token: code, secret: user.mfaSecret });
    if (result?.valid === true) return true;
    // Try backup code as fallback
    return this.verifyBackupCode(userId, code);
  }

  /**
   * Désactive le MFA et purge TOUS les champs associés (mfaSecret + backupCodes).
   *
   * IMPORTANT — ne pas laisser `backupCodes` intact : sinon on aboutit à un état
   * incohérent (mfaEnabled=false mais backupCodes populés), ce qui a déjà causé
   * l'incident aculleron (avril 2026).
   *
   * @param userId  Le compte cible (celui dont le MFA est désactivé).
   * @param opts    Contexte d'audit — actorId peut différer de userId si c'est
   *                un SUPER_ADMIN qui désactive le MFA d'un autre utilisateur.
   */
  async disableMfa(
    userId: string,
    opts?: {
      actorId?: string;
      method?: "password" | "totp" | "backup" | "admin";
      ip?: string;
      userAgent?: string;
    },
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, backupCodes: null },
    });

    const actorId = opts?.actorId ?? userId;
    const isAdminAction = actorId !== userId;

    this.auditService
      .log({
        userId: actorId,
        ipAddress: opts?.ip,
        userAgent: opts?.userAgent,
        action: "MFA_DISABLED",
        resourceType: "User",
        resourceId: userId,
        metadata: {
          targetUserId: userId,
          isAdminAction,
          method: opts?.method ?? (isAdminAction ? "admin" : "unknown"),
        },
        severity: "WARN",
      })
      .catch((err) =>
        this.logger.error(`Audit log failed (MFA_DISABLED): ${err.message}`),
      );

    this.logger.log(
      `MFA disabled for user ${userId} by ${actorId} (method: ${opts?.method ?? "admin"})`,
    );
    return { message: "MFA désactivé" };
  }

  /**
   * Self-service MFA disable — exige une ré-authentification explicite pour
   * empêcher qu'une session volée puisse sauter la 2FA sans challenge.
   *
   * Accepte au choix :
   *   - `password` : mot de passe du compte (LDAP puis bcrypt local en fallback)
   *   - `code`     : code TOTP à 6 chiffres, ou code de secours
   *
   * Un échec est loggué (MFA_DISABLE_FAILED, severity WARN) même si le compte
   * reste dans son état MFA précédent — pour détection d'attaque.
   */
  async disableMfaOwn(
    userId: string,
    challenge: { password?: string; code?: string },
    ctx: { ip?: string; userAgent?: string },
  ) {
    if (!challenge.password && !challenge.code) {
      throw new BadRequestException(
        "Mot de passe ou code MFA requis pour désactiver",
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let method: "password" | "totp" | "backup" | null = null;

    if (challenge.password) {
      if (
        await this.verifyPassword(
          user.email,
          user.passwordHash,
          challenge.password,
        )
      ) {
        method = "password";
      }
    }

    if (!method && challenge.code && user.mfaEnabled && user.mfaSecret) {
      const result = await verifySync({
        token: challenge.code,
        secret: user.mfaSecret,
      });
      if (result?.valid === true) {
        method = "totp";
      } else if (await this.verifyBackupCode(userId, challenge.code)) {
        method = "backup";
      }
    }

    if (!method) {
      this.auditService
        .log({
          userId,
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
          action: "MFA_DISABLE_FAILED",
          resourceType: "User",
          resourceId: userId,
          metadata: {
            reason: "reauth_failed",
            providedPassword: !!challenge.password,
            providedCode: !!challenge.code,
          },
          severity: "WARN",
        })
        .catch((err) =>
          this.logger.error(
            `Audit log failed (MFA_DISABLE_FAILED): ${err.message}`,
          ),
        );
      throw new UnauthorizedException("Mot de passe ou code MFA invalide");
    }

    return this.disableMfa(userId, {
      actorId: userId,
      method,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  private async verifyPassword(
    email: string,
    passwordHash: string,
    password: string,
  ): Promise<boolean> {
    // LDAP d'abord (pour comptes synchronisés depuis AD) — passwordHash local est random pour ces comptes
    try {
      const ldapUser = await this.ldapService.authenticate(email, password);
      if (ldapUser) return true;
    } catch {
      // LDAP indisponible → fallback local
    }
    return bcrypt.compare(password, passwordHash);
  }

  async isMfaRequired(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return false;
    // Un utilisateur doit passer MFA si :
    //  - il l'a déjà activé (mfaEnabled), ou
    //  - un admin lui a imposé la politique MFA (mfaRequired).
    return user.mfaEnabled || user.mfaRequired;
  }

  /**
   * Retourne true si l'utilisateur doit ACTIVER son MFA avant de pouvoir
   * accéder à l'intranet (politique admin mfaRequired mais non encore activé).
   */
  async mustEnrollMfa(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaRequired: true },
    });
    return !!user?.mfaRequired && !user?.mfaEnabled;
  }

  async generateBackupCodes(
    userId: string,
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<string[]> {
    const codes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString("hex").toUpperCase(),
    );

    // Store hashed codes in DB
    const hashedCodes = codes.map((code) =>
      crypto.createHash("sha256").update(code).digest("hex"),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { backupCodes: JSON.stringify(hashedCodes) },
    });

    this.logger.log(`Backup codes generated and stored for user ${userId}`);
    this.auditService
      .log({
        userId,
        ipAddress: ctx?.ip,
        userAgent: ctx?.userAgent,
        action: "MFA_BACKUP_CODES_GENERATED",
        resourceType: "User",
        resourceId: userId,
        metadata: { count: codes.length },
        severity: "WARN",
      })
      .catch((err) =>
        this.logger.error(
          `Audit log failed (MFA_BACKUP_CODES_GENERATED): ${err.message}`,
        ),
      );

    return codes; // Return plaintext codes (shown once to user)
  }

  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.backupCodes) return false;

    let hashedCodes: string[];
    try {
      hashedCodes = JSON.parse(user.backupCodes);
    } catch {
      return false;
    }
    if (!Array.isArray(hashedCodes)) return false;

    const hashedInput = crypto
      .createHash("sha256")
      .update(code.toUpperCase())
      .digest("hex");
    const index = hashedCodes.indexOf(hashedInput);

    if (index === -1) return false;

    // Remove used code (one-time use)
    hashedCodes.splice(index, 1);
    await this.prisma.user.update({
      where: { id: userId },
      data: { backupCodes: JSON.stringify(hashedCodes) },
    });

    this.logger.log(
      `Backup code used for user ${userId} (${hashedCodes.length} remaining)`,
    );
    return true;
  }

  /**
   * Politique MFA admin : marque les utilisateurs ciblés comme devant activer
   * leur MFA (flag mfaRequired=true). La prochaine connexion leur impose
   * l'enrôlement MFA. ISO 27001 A.8.5 (authentification forte).
   *
   * @param roles liste optionnelle de rôles à cibler (ex: ['ADMIN', 'SUPER_ADMIN']).
   *              Sans paramètre → tous les utilisateurs actifs.
   */
  async enforceMfa(
    roles?: string[],
  ): Promise<{
    message: string;
    count: number;
    flagged: number;
    alreadyEnabled: number;
  }> {
    const where: any = { isActive: true, deletedAt: null };
    if (roles?.length) where.role = { in: roles };

    const targetUsers = await this.prisma.user.findMany({
      where,
      select: { id: true, email: true, mfaEnabled: true, mfaRequired: true },
    });

    const alreadyEnabled = targetUsers.filter((u) => u.mfaEnabled).length;
    const toFlag = targetUsers.filter((u) => !u.mfaEnabled && !u.mfaRequired);

    if (toFlag.length > 0) {
      await this.prisma.user.updateMany({
        where: { id: { in: toFlag.map((u) => u.id) } },
        data: { mfaRequired: true },
      });
      this.logger.log(
        `Politique MFA appliquée à ${toFlag.length} utilisateur(s)${roles?.length ? ` (rôles: ${roles.join(",")})` : ""}`,
      );
      this.auditService
        .log({
          action: "MFA_POLICY_ENFORCED",
          resourceType: "User",
          metadata: {
            count: toFlag.length,
            roles: roles || "ALL",
            userIds: toFlag.map((u) => u.id),
          },
          severity: "WARN",
        })
        .catch((err) =>
          this.logger.error(
            `Audit log failed (MFA_POLICY_ENFORCED): ${err.message}`,
          ),
        );
    }

    return {
      message:
        toFlag.length > 0
          ? `MFA obligatoire pour ${toFlag.length} utilisateur(s) à leur prochaine connexion`
          : alreadyEnabled === targetUsers.length
            ? "Tous les utilisateurs ciblés ont déjà le MFA activé"
            : "Aucun utilisateur à marquer (MFA déjà imposé ou activé)",
      count: targetUsers.length,
      flagged: toFlag.length,
      alreadyEnabled,
    };
  }

  /**
   * Lève la politique MFA pour un utilisateur (admin uniquement).
   */
  async releaseMfaRequirement(userId: string, actorId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaRequired: false, mfaEnforcedAt: null, mfaEnforcedById: null },
    });
    this.auditService
      .log({
        userId,
        action: "MFA_POLICY_RELEASED",
        resourceType: "User",
        resourceId: userId,
        metadata: { actorId },
        severity: "INFO",
      })
      .catch((err) =>
        this.logger.error(
          `Audit log failed (MFA_POLICY_RELEASED): ${err.message}`,
        ),
      );
  }

  /**
   * Politique MFA per-user — pose ou retire `mfaRequired` sur un utilisateur
   * cible avec traçabilité complète (mfaEnforcedAt + mfaEnforcedById). Audité
   * en severity WARN. Notification utilisateur au prochain login (déjà géré
   * via `mfaSetupRequired` retourné par /auth/login).
   *
   * @param targetUserId  Compte impacté.
   * @param enforced      true = imposer le MFA, false = lever la politique.
   * @param actorId       Admin SUPER_ADMIN qui pose l'action (audit + traçabilité).
   * @param ctx           Contexte de la requête pour audit (ip, user-agent).
   */
  async setMfaPolicy(
    targetUserId: string,
    enforced: boolean,
    actorId: string,
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<{ message: string; mfaRequired: boolean }> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        mfaEnabled: true,
        mfaRequired: true,
      },
    });
    if (!target) throw new BadRequestException("Utilisateur introuvable");

    if (enforced && target.mfaEnabled) {
      // No-op : MFA déjà actif → la politique n'a aucun effet visible. On
      // trace l'intention quand même mais on ne pose pas le flag pour éviter
      // de polluer l'UI admin avec un badge "Forcé" sur un compte conforme.
      this.auditService
        .log({
          userId: actorId,
          ipAddress: ctx?.ip,
          userAgent: ctx?.userAgent,
          action: "MFA_POLICY_NOOP",
          resourceType: "User",
          resourceId: targetUserId,
          metadata: { reason: "already_enabled", target: target.email },
          severity: "INFO",
        })
        .catch((err) =>
          this.logger.error(
            `Audit log failed (MFA_POLICY_NOOP): ${err.message}`,
          ),
        );
      return {
        message:
          "MFA déjà activé pour cet utilisateur — politique sans effet.",
        mfaRequired: target.mfaRequired,
      };
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: enforced
        ? {
            mfaRequired: true,
            mfaEnforcedAt: new Date(),
            mfaEnforcedById: actorId,
          }
        : {
            mfaRequired: false,
            mfaEnforcedAt: null,
            mfaEnforcedById: null,
          },
    });

    const action = enforced ? "MFA_POLICY_SET" : "MFA_POLICY_RELEASED";
    this.auditService
      .log({
        userId: actorId,
        ipAddress: ctx?.ip,
        userAgent: ctx?.userAgent,
        action,
        resourceType: "User",
        resourceId: targetUserId,
        metadata: {
          target: target.email,
          enforced,
          previousMfaRequired: target.mfaRequired,
        },
        severity: "WARN",
      })
      .catch((err) =>
        this.logger.error(`Audit log failed (${action}): ${err.message}`),
      );
    this.logger.log(
      `MFA policy ${enforced ? "set" : "released"} for user ${targetUserId} by ${actorId}`,
    );

    return {
      message: enforced
        ? "Politique MFA imposée — l'utilisateur devra activer son MFA à la prochaine connexion."
        : "Politique MFA levée pour cet utilisateur.",
      mfaRequired: enforced,
    };
  }

  /**
   * Re-validation MFA — appelée par `POST /mfa/revalidate` quand un endpoint
   * sensible a renvoyé `MFA_REVALIDATION_REQUIRED`. Vérifie le code TOTP/secours
   * et marque la session active comme fraîchement validée. Le frontend reçoit
   * un nouvel access token avec `mfaValidatedAt = now` et peut retenter sa
   * requête initiale.
   *
   * Contrainte de sécurité : ne fonctionne QUE pour un user MFA-actif.
   * Sans MFA actif, la re-validation n'a aucun sens — on rejette en 400.
   */
  async revalidateMfa(
    userId: string,
    code: string,
  ): Promise<{ valid: boolean; mfaValidatedAt: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException("MFA non activé pour ce compte");
    }
    const valid = await this.verifyMfa(userId, code);
    if (!valid) {
      this.auditService
        .log({
          userId,
          action: "MFA_REVALIDATE_FAILED",
          resourceType: "User",
          resourceId: userId,
          severity: "WARN",
        })
        .catch((err) =>
          this.logger.error(
            `Audit log failed (MFA_REVALIDATE_FAILED): ${err.message}`,
          ),
        );
      throw new UnauthorizedException("Code MFA invalide");
    }
    const now = Date.now();
    // Met à jour TOUS les refresh tokens actifs de cet utilisateur — chaque
    // device ouvert profite ainsi de la re-validation. Côté JWT, le claim sera
    // ré-injecté à la prochaine rotation de l'access token (auto via interceptor).
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { mfaValidatedAt: new Date(now) },
    });
    this.auditService
      .log({
        userId,
        action: "MFA_REVALIDATED",
        resourceType: "User",
        resourceId: userId,
        severity: "INFO",
      })
      .catch((err) =>
        this.logger.error(
          `Audit log failed (MFA_REVALIDATED): ${err.message}`,
        ),
      );
    return { valid: true, mfaValidatedAt: now };
  }
}
