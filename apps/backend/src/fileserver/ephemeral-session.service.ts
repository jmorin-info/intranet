import { Injectable, Logger, NotFoundException, BadRequestException, GatewayTimeoutException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { FileserverService } from './fileserver.service';

/**
 * Session éphémère pour ouvrir un fichier SMB dans OnlyOffice
 * sans avoir besoin d'un Document persisté en base.
 *
 * Une session :
 *   - mémorise le chemin SMB (share + path relatif), l'utilisateur et ses droits
 *   - est référencée par un sessionId (UUID) et un JWT signé d'accès fichier
 *   - expire au bout de 4h (alignement avec le TTL JWT)
 *   - est purgée toutes les 10 minutes par un setInterval
 *
 * Toutes les opérations SMB sont déléguées au FileserverService existant.
 */

export interface EphemeralSession {
  sessionId: string;
  share: string;
  /** Chemin relatif au sein du share, avec backslashes (format SMB natif) */
  smbPath: string;
  fileName: string;
  userId: string;
  userRole: string;
  canEdit: boolean;
  createdAt: number;
}

const SESSION_TTL_MS = 4 * 3600 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class EphemeralSessionService {
  private readonly logger = new Logger(EphemeralSessionService.name);
  private readonly sessions = new Map<string, EphemeralSession>();
  private readonly fileTokenSecret =
    process.env.JWT_ACCESS_SECRET || 'insecure-dev-only';

  constructor(
    private readonly jwtService: JwtService,
    private readonly fileserverService: FileserverService,
  ) {
    setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS).unref?.();
  }

  /**
   * Parse un chemin "share/sub/dir/file.docx" en { share, smbPath (backslash), fileName }.
   * Accepte aussi bien "/" que "\" comme séparateurs côté entrée.
   */
  private parsePath(rawPath: string): { share: string; smbPath: string; fileName: string } {
    if (!rawPath || typeof rawPath !== 'string') {
      throw new BadRequestException('Chemin invalide');
    }
    // Normalise : remplace backslashes par slashes pour le split
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.includes('..')) {
      throw new BadRequestException('Chemin invalide (traversal)');
    }
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new BadRequestException('Le chemin doit inclure au moins le partage et un fichier');
    }
    const share = FileserverService.validateShareName(parts[0]);
    const fileName = parts[parts.length - 1]!;
    // Le SMB côté smbclient utilise "\" comme séparateur
    const smbPath = parts.slice(1).join('\\');
    return { share, smbPath, fileName };
  }

  /**
   * Crée une session éphémère et signe un JWT d'accès.
   */
  createSession(params: {
    rawPath: string;
    userId: string;
    userRole: string;
    canEdit: boolean;
  }): { session: EphemeralSession; token: string } {
    const { share, smbPath, fileName } = this.parsePath(params.rawPath);

    const sessionId = randomUUID();
    const session: EphemeralSession = {
      sessionId,
      share,
      smbPath,
      fileName,
      userId: params.userId,
      userRole: params.userRole,
      canEdit: params.canEdit,
      createdAt: Date.now(),
    };
    this.sessions.set(sessionId, session);

    const token = this.jwtService.sign(
      { sub: sessionId, purpose: 'smb-office-ephemeral' },
      { secret: this.fileTokenSecret, expiresIn: '4h' },
    );

    this.logger.log(
      `Session SMB-OnlyOffice créée — sessionId=${sessionId} userId=${params.userId} share=${share} path=${smbPath}`,
    );
    this.logger.log(
      `AUDIT [SMB-OPEN] userId=${params.userId} share=${share} path=${smbPath} canEdit=${params.canEdit}`,
    );

    return { session, token };
  }

  /**
   * Vérifie un JWT d'accès et retourne le sessionId si valide.
   */
  verifyToken(token: string): string | null {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.fileTokenSecret,
      }) as { sub?: string; purpose?: string };
      if (payload.purpose !== 'smb-office-ephemeral' || !payload.sub) {
        return null;
      }
      return payload.sub;
    } catch {
      return null;
    }
  }

  getSession(sessionId: string): EphemeralSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('Session SMB-OnlyOffice introuvable ou expirée');
    }
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(sessionId);
      throw new NotFoundException('Session SMB-OnlyOffice expirée');
    }
    return session;
  }

  /**
   * Récupère le contenu du fichier SMB pour streaming vers OnlyOffice Docs.
   * Renvoie le buffer + nom du fichier (le controller le pipe).
   */
  getFileBuffer(sessionId: string): { buffer: Buffer; fileName: string } {
    const session = this.getSession(sessionId);
    try {
      const buffer = this.fileserverService.downloadFile(
        session.share,
        session.smbPath,
        session.userRole,
        session.userId,
      );
      return { buffer, fileName: session.fileName };
    } catch (err: any) {
      if (err?.name === 'NotFoundException') throw err;
      const msg = err?.message || String(err);
      if (/timeout|timed out|ETIMEDOUT/i.test(msg)) {
        throw new GatewayTimeoutException('Timeout lors de la lecture SMB');
      }
      throw err;
    }
  }

  /**
   * Sauvegarde un buffer dans le chemin SMB de la session (overwrite).
   */
  saveFile(sessionId: string, buffer: Buffer): void {
    const session = this.getSession(sessionId);
    if (!session.canEdit) {
      throw new BadRequestException('Session en lecture seule');
    }

    // smbPath est "sub\dir\file.docx" — on extrait dir + fileName pour réutiliser
    // l'API uploadFile du FileserverService (qui prend dir + name + buffer).
    const lastSep = session.smbPath.lastIndexOf('\\');
    const dirPath = lastSep >= 0 ? session.smbPath.substring(0, lastSep) : '';
    const fileName = lastSep >= 0 ? session.smbPath.substring(lastSep + 1) : session.smbPath;

    try {
      this.fileserverService.uploadFile(
        session.share,
        dirPath,
        fileName,
        buffer,
        session.userRole,
        session.userId,
      );
      this.logger.log(
        `AUDIT [SMB-SAVE] userId=${session.userId} share=${session.share} path=${session.smbPath} bytes=${buffer.length}`,
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (/timeout|ETIMEDOUT/i.test(msg)) {
        throw new GatewayTimeoutException('Timeout lors de l\'écriture SMB');
      }
      throw err;
    }
  }

  /**
   * Suppression manuelle (par exemple lors de la fermeture explicite de l'éditeur).
   */
  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.log(`Cleanup sessions SMB-OnlyOffice : ${removed} session(s) expirée(s) supprimée(s)`);
    }
  }
}
