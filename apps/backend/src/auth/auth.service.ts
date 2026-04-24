import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LdapService } from '../ldap/ldap.service';
import { AuditService } from '../audit/audit.service';
import { HibpService } from './hibp.service';
import { JwtPayload } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly ldapService: LdapService,
    private readonly auditService: AuditService,
    private readonly hibpService: HibpService,
  ) {}

  /**
   * Validate user credentials.
   * Strategy: LDAPS first (if enabled) → fallback to local DB.
   */
  async validateUser(email: string, password: string) {
    // --- Try LDAPS authentication first ---
    try {
      const ldapUser = await this.ldapService.authenticate(email, password);
      if (ldapUser) {
        const syncedUser = await this.ldapService.syncUser(ldapUser);
        // Récupère le user BRUT (non-sanitized) pour avoir mfaEnabled + mfaSecret
        // car le contrôleur auth a besoin de vérifier mfaSecret pour le challenge MFA.
        const fullUser = await this.prisma.user.findUnique({
          where: { id: syncedUser.id },
          include: { department: true },
        });
        if (!fullUser) throw new UnauthorizedException('Utilisateur introuvable après sync LDAP');
        this.logger.log(`User ${email} authenticated via LDAPS`);
        return fullUser;
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn(`LDAP auth attempt failed for ${email}, falling back to local: ${err instanceof Error ? err.message : err}`);
    }

    // --- Fallback: local database authentication ---
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.auditService.log({
        action: 'LOGIN_FAILED',
        resourceType: 'AUTH',
        metadata: { email, reason: 'user_not_found' },
        severity: 'WARN',
      }).catch(err => this.logger.error(`Audit log failed (LOGIN_FAILED/user_not_found): ${err.message}`));
      throw new UnauthorizedException('Identifiants incorrects');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Ce compte est désactivé');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('Ce compte a été supprimé');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.auditService.log({
        userId: user.id,
        action: 'LOGIN_FAILED',
        resourceType: 'AUTH',
        resourceId: user.id,
        metadata: { email, reason: 'invalid_password' },
        severity: 'WARN',
      }).catch(err => this.logger.error(`Audit log failed (LOGIN_FAILED/invalid_password): ${err.message}`));
      throw new UnauthorizedException('Identifiants incorrects');
    }

    this.logger.log(`User ${email} authenticated via local database`);
    return user;
  }

  async login(
    user: { id: string; email: string; role: string; departmentId?: string | null },
    ip: string,
    userAgent: string,
  ) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as UserRole,
      departmentId: user.departmentId ?? undefined,
    };

    const accessToken = this.generateAccessToken(payload);
    const { token: refreshToken, hash: refreshTokenHash } =
      this.generateRefreshToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // ANSSI — Détection de sessions concurrentes : si d'autres refresh tokens
    // actifs existent pour cet utilisateur, logger l'événement dans l'audit.
    // Les anciennes sessions restent valides (pas de kill) conformément à la
    // politique intranet, mais l'événement est tracé.
    const existingSessions = await this.prisma.refreshToken.count({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        userAgent: { not: 'PASSWORD_RESET' },
      },
    });

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: refreshTokenHash,
        userId: user.id,
        expiresAt,
        ipAddress: ip,
        userAgent,
      },
    });

    if (existingSessions > 0) {
      await this.auditService.log({
        userId: user.id,
        ipAddress: ip,
        userAgent,
        action: 'CONCURRENT_SESSION',
        resourceType: 'AUTH',
        resourceId: user.id,
        metadata: {
          existingActiveSessions: existingSessions,
          newDeviceIp: ip,
          newDeviceUserAgent: userAgent,
        },
        severity: 'WARN',
      });
      this.logger.warn(
        `User ${user.email} logged in from ${ip} with ${existingSessions} existing active session(s)`,
      );
    }

    // Clean up expired/revoked refresh tokens for this user (prevents session leak)
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const fullUser = await this.usersService.findById(user.id);
    const { passwordHash, mfaSecret, ...safeUser } = fullUser;

    this.logger.log(`User ${user.email} logged in from ${ip}`);

    this.auditService.log({
      userId: user.id,
      ipAddress: ip,
      userAgent,
      action: 'LOGIN_SUCCESS',
      resourceType: 'AUTH',
      resourceId: user.id,
      severity: 'INFO',
    }).catch(err => this.logger.error(`Audit log failed (LOGIN_SUCCESS): ${err.message}`));

    // TODO(ANSSI): Migrer le refresh token vers un cookie httpOnly + Secure + SameSite=Strict
    // au lieu du stockage localStorage côté frontend (vulnérable XSS).
    // Breaking change frontend — à planifier dans un sprint dédié.
    // Ref: ANSSI R16 — Protection des jetons de session.
    return {
      accessToken,
      refreshToken,
      user: safeUser,
    };
  }

  async refreshTokens(refreshToken: string, ip: string, userAgent: string) {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Session expirée');
    }

    if (!storedToken.user.isActive || storedToken.user.deletedAt) {
      throw new UnauthorizedException('Ce compte est désactivé ou supprimé');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role as UserRole,
      departmentId: storedToken.user.departmentId || undefined,
    };

    const newAccessToken = this.generateAccessToken(payload);
    const { token: newRefreshToken, hash: newRefreshTokenHash } =
      this.generateRefreshToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: newRefreshTokenHash,
        userId: storedToken.user.id,
        expiresAt,
        ipAddress: ip,
        userAgent,
      },
    });

    const { passwordHash, mfaSecret, ...safeUser } = storedToken.user;

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: safeUser,
    };
  }

  async logout(userId: string, refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        tokenHash,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`User ${userId} logged out`);
  }

  generateAccessToken(payload: JwtPayload): string {
    // Shorter expiry for prestataires (ISO 27001 A.5.19)
    // PRESTATAIRE sessions: 30min JWT + PrestataireSessionGuard checks ExternalAccess.sessionTimeout
    // If sessionTimeout < 30min, the guard rejects earlier. If > 30min, token refresh extends it.
    if (payload.role === UserRole.PRESTATAIRE) {
      return this.jwtService.sign(payload, { expiresIn: '30m' });
    }
    return this.jwtService.sign(payload);
  }

  generateRefreshToken(): { token: string; hash: string } {
    const token = uuidv4();
    const hash = this.hashToken(token);
    return { token, hash };
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true, deletedAt: null },
    });

    // Always return success (prevent email enumeration)
    if (!user) {
      return { message: 'Si cette adresse existe, un email de réinitialisation a été envoyé' };
    }

    // Generate reset token (expires in 1 hour)
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Store in RefreshToken table (reuse with a special userAgent marker)
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgent: 'PASSWORD_RESET',
      },
    });

    // Log for audit
    this.logger.log(`Password reset requested for ${email}`);

    return {
      message: 'Si cette adresse existe, un email de réinitialisation a été envoyé',
      // In dev, include token for testing (remove in prod)
      ...(process.env.NODE_ENV === 'development' ? { resetToken: token } : {}),
    };
  }

  async resetPasswordWithToken(token: string, newPassword: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        userAgent: 'PASSWORD_RESET',
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Lien de réinitialisation invalide ou expiré');
    }

    // Validate password policy (ISO 27001 A.5.17)
    const policyErrors: string[] = [];
    if (newPassword.length < 12) policyErrors.push('Minimum 12 caractères');
    if (!/[A-Z]/.test(newPassword)) policyErrors.push('Au moins une majuscule');
    if (!/[a-z]/.test(newPassword)) policyErrors.push('Au moins une minuscule');
    if (!/[0-9]/.test(newPassword)) policyErrors.push('Au moins un chiffre');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) policyErrors.push('Au moins un caractère spécial');
    if (policyErrors.length > 0) {
      throw new BadRequestException(`Mot de passe non conforme : ${policyErrors.join(', ')}`);
    }

    // ANSSI R20 — Vérification HIBP (k-anonymity, ne fuite pas le mot de passe).
    await this.hibpService.assertPasswordNotPwned(newPassword);

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password — track rotation timestamp for AccessReview PASSWORDS campaigns
    // (ISO 27001 A.5.17 / A.5.18).
    await this.prisma.user.update({
      where: { id: storedToken.userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });

    // Revoke the reset token
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Revoke ALL existing refresh tokens for this user (force re-login)
    await this.prisma.refreshToken.updateMany({
      where: { userId: storedToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`Password reset completed for user ${storedToken.user.email}`);

    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
