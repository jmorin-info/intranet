import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

/**
 * MFA Service — TOTP via otplib v13 (async API).
 * ISO 27001 A.8.5 — Secure Authentication.
 *
 * IMPORTANT: otplib v13 expose toutes ses fonctions en async (Promise).
 * Tout appel sans `await` retourne une Promise non résolue → secret invalide.
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Génère un nouveau secret TOTP et un QR code. */
  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const secret = await generateSecret();
    const otpAuthUrl = await generateURI({ secret, issuer: 'OMNITECH Security', label: user.email });
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    return { secret, qrCodeDataUrl, otpAuthUrl };
  }

  async activateMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecret) throw new BadRequestException('MFA not configured');

    const result = await verifySync({ token: code, secret: user.mfaSecret });
    if (!result?.valid) {
      this.logger.warn(`Invalid MFA activation code for user ${userId}`);
      throw new BadRequestException('Code TOTP invalide');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    this.logger.log(`MFA activated for user ${userId}`);
    return { message: 'MFA activé avec succès' };
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

  async disableMfa(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });
    return { message: 'MFA désactivé' };
  }

  async isMfaRequired(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user?.mfaEnabled || false;
  }

  async generateBackupCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Store hashed codes in DB
    const hashedCodes = codes.map(code =>
      crypto.createHash('sha256').update(code).digest('hex')
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { backupCodes: JSON.stringify(hashedCodes) },
    });

    this.logger.log(`Backup codes generated and stored for user ${userId}`);
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

    const hashedInput = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
    const index = hashedCodes.indexOf(hashedInput);

    if (index === -1) return false;

    // Remove used code (one-time use)
    hashedCodes.splice(index, 1);
    await this.prisma.user.update({
      where: { id: userId },
      data: { backupCodes: JSON.stringify(hashedCodes) },
    });

    this.logger.log(`Backup code used for user ${userId} (${hashedCodes.length} remaining)`);
    return true;
  }

  async enforceMfa(roles?: string[]): Promise<{ message: string; count: number; notified: number }> {
    const where: any = { isActive: true, deletedAt: null, mfaEnabled: false };
    if (roles?.length) where.role = { in: roles };
    const users = await this.prisma.user.findMany({ where, select: { id: true, email: true, firstName: true } });
    return {
      message: `${users.length} utilisateur(s) sans MFA`,
      count: users.length,
      notified: 0,
    };
  }
}
