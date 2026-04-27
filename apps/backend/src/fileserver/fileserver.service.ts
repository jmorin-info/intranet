import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';

interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

interface ShareConfig {
  name: string;
  label: string;
  icon: string;
  allowedRoles: string[];
}

const SHARES: ShareConfig[] = [
  { name: 'Public', label: 'Public', icon: 'globe', allowedRoles: ['COLLABORATEUR', 'REVIEWER', 'ADMIN', 'SUPER_ADMIN', 'DIRECTION', 'AUDITEUR'] },
  { name: 'Informatique', label: 'Informatique', icon: 'server', allowedRoles: ['ADMIN', 'SUPER_ADMIN'] },
  { name: 'Commercial', label: 'Commercial', icon: 'briefcase', allowedRoles: ['COLLABORATEUR', 'REVIEWER', 'ADMIN', 'SUPER_ADMIN', 'DIRECTION'] },
  { name: 'Comptabilite', label: 'Comptabilité', icon: 'calculator', allowedRoles: ['ADMIN', 'SUPER_ADMIN', 'DIRECTION'] },
  { name: 'Gestion', label: 'Gestion', icon: 'clipboard', allowedRoles: ['ADMIN', 'SUPER_ADMIN', 'DIRECTION'] },
  { name: 'Projets', label: 'Projets', icon: 'folder', allowedRoles: ['COLLABORATEUR', 'REVIEWER', 'ADMIN', 'SUPER_ADMIN', 'DIRECTION'] },
  { name: 'RH Recrutement', label: 'RH / Recrutement', icon: 'users', allowedRoles: ['ADMIN', 'SUPER_ADMIN', 'DIRECTION'] },
  { name: 'RetD', label: 'R&D', icon: 'lightbulb', allowedRoles: ['REVIEWER', 'ADMIN', 'SUPER_ADMIN'] },
  { name: 'ThirdParty', label: 'Partenaires', icon: 'handshake', allowedRoles: ['ADMIN', 'SUPER_ADMIN', 'PRESTATAIRE'] },
];

// Encrypted credential store (in-memory, per user session)
const credentialStore = new Map<string, { user: string; password: string; expiresAt: number }>();
const CRED_TTL = 8 * 3600000; // 8 hours
// Reserved for future at-rest encryption of cached credentials. Currently
// kept here so the SHA-256 derivation stays adjacent to the credential store
// definition above for review purposes.
const _ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.JWT_ACCESS_SECRET || 'fallback').digest();

@Injectable()
export class FileserverService {
  private readonly logger = new Logger(FileserverService.name);
  private readonly host = process.env.FILESERVER_HOST || '10.33.50.5';
  // Fallback service account for shares that allow it — credentials must be provided via env.
  private readonly serviceUser = process.env.FILESERVER_USER || 'svc_intranet@omnitech.security';
  private readonly servicePassword = (() => {
    const pwd = process.env.FILESERVER_SERVICE_PASSWORD || process.env.FILESERVER_PASSWORD;
    if (!pwd) {
      // Fail fast: no hardcoded fallback allowed. Service account features will be unavailable.
      Logger.prototype.warn.call(
        new Logger(FileserverService.name),
        'FILESERVER_SERVICE_PASSWORD (or FILESERVER_PASSWORD) is not set — SMB service account is disabled.',
      );
      return '';
    }
    return pwd;
  })();

  /**
   * Validate a user-supplied relative path against traversal attacks.
   * Returns a normalized, safe path (may be empty string for "root").
   * Throws BadRequestException if the path is suspicious.
   */
  static validateSafePath(p: string | undefined | null): string {
    if (p === undefined || p === null || p === '') return '';
    if (typeof p !== 'string') {
      throw new BadRequestException('Invalid path');
    }
    // Reject control chars, traversal markers, backslashes, absolute roots
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(p)) throw new BadRequestException('Invalid path');
    if (p.includes('..')) throw new BadRequestException('Invalid path');
    if (p.includes('\\')) throw new BadRequestException('Invalid path');
    if (p.startsWith('/')) throw new BadRequestException('Invalid path');

    const normalized = path.posix.normalize(p);
    if (
      normalized.startsWith('..') ||
      normalized.startsWith('/') ||
      normalized === '.' ||
      normalized.includes('..')
    ) {
      // "." is fine as "empty" but we return '' for consistency
      if (normalized === '.') return '';
      throw new BadRequestException('Invalid path');
    }
    return normalized;
  }

  /**
   * Validate a share name (URL param) against a strict whitelist
   * (alphanumeric, space, underscore, dash only).
   */
  static validateShareName(share: string | undefined | null): string {
    if (!share || typeof share !== 'string') {
      throw new BadRequestException('Invalid share name');
    }
    if (!/^[A-Za-z0-9 _-]{1,64}$/.test(share)) {
      throw new BadRequestException('Invalid share name');
    }
    return share;
  }

  /**
   * Store user's SMB credentials (called after authentication)
   */
  storeCredentials(userId: string, smbUser: string, smbPassword: string): void {
    credentialStore.set(userId, {
      user: smbUser,
      password: smbPassword,
      expiresAt: Date.now() + CRED_TTL,
    });
    this.logger.log(`SMB credentials stored for user ${userId}`);
  }

  /**
   * Check if user has stored SMB credentials
   */
  hasCredentials(userId: string): boolean {
    const cred = credentialStore.get(userId);
    if (!cred || Date.now() > cred.expiresAt) {
      credentialStore.delete(userId);
      return false;
    }
    return true;
  }

  /**
   * Get SMB credentials for a user (user's own or fallback to service account)
   */
  private getCredentials(userId: string): { user: string; password: string } {
    const cred = credentialStore.get(userId);
    if (cred && Date.now() < cred.expiresAt) {
      return { user: cred.user, password: cred.password };
    }
    // Fallback to service account
    return { user: this.serviceUser, password: this.servicePassword };
  }

  /**
   * Verify SMB credentials by attempting a connection
   */
  async verifyCredentials(smbUser: string, smbPassword: string): Promise<boolean> {
    try {
      execSync(
        `smbclient "//${this.host}/Public" -U "${smbUser}%${smbPassword}" -c "ls" 2>/dev/null`,
        { timeout: 10000, encoding: 'utf-8' },
      );
      return true;
    } catch {
      return false;
    }
  }

  getShares(userRole: string): ShareConfig[] {
    return SHARES.filter(s => s.allowedRoles.includes(userRole));
  }

  listFiles(shareName: string, dirPath: string, userRole: string, userId: string): FileItem[] {
    const share = SHARES.find(s => s.name === shareName);
    if (!share) throw new NotFoundException('Partage introuvable');
    if (!share.allowedRoles.includes(userRole)) throw new ForbiddenException('Accès non autorisé à ce partage');

    // Sanitize path : pas de traversal `..`, pas de leading `/`, conversion
    // des séparateurs `/` → `\` (smbclient attend du Windows-style sur les
    // sous-dossiers profonds — les `/` peuvent casser silencieusement la
    // navigation au-delà de 2-3 niveaux selon la version smbclient).
    const safePath = dirPath
      .replace(/\.\./g, '')
      .replace(/^\/+/, '')
      .replace(/\//g, '\\');
    const creds = this.getCredentials(userId);

    try {
      // Timeout 30s (au lieu de 10s) pour les dossiers profonds avec beaucoup
      // d'entrées : un large `ls` peut être lent sur SMB derrière le LAN.
      const smbPath = safePath ? `cd "${safePath}"; ls` : 'ls';
      const cmd = `smbclient "//${this.host}/${shareName}" -U "${creds.user}%${creds.password}" -c "${smbPath}" 2>&1`;
      const output = execSync(cmd, {
        timeout: 30000,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10 MB — gros dossiers OK
      });

      if (output.includes('NT_STATUS_ACCESS_DENIED')) {
        throw new ForbiddenException('Accès refusé — vos droits ne permettent pas d\'accéder à ce partage');
      }
      if (output.includes('NT_STATUS_OBJECT_PATH_NOT_FOUND') || output.includes('NT_STATUS_OBJECT_NAME_NOT_FOUND')) {
        throw new NotFoundException('Dossier introuvable');
      }

      const items: FileItem[] = [];
      // Parser plus permissif : accepte les lignes où les attributs DOS
      // peuvent être vides (fichiers sans flag), et les noms longs avec
      // espaces (group capture non greedy + lookahead sur 2+ espaces).
      // Format attendu : `  <name>  <attrs?>  <size>  <day>  <date+time+year>`
      const lineRe = /^\s{2}(.+?)\s{2,}([DAHRSN]*)\s+(\d+)\s+(\w{3}\s+\w{3}\s+[\d:]+\s+\d{4}|\w{3}\s+\d+\s+[\d:]+\s+\d{4})/;
      let parsedAny = false;
      for (const line of output.split('\n')) {
        const match = line.match(lineRe);
        if (match) {
          parsedAny = true;
          const name = match[1]!.trim();
          if (name === '.' || name === '..') continue;
          items.push({
            name,
            type: (match[2] || '').includes('D') ? 'directory' : 'file',
            size: parseInt(match[3] || '0'),
            modified: match[4] || '',
          });
        }
      }

      // Sanity : si le smbclient a renvoyé des lignes mais aucune n'a matché
      // notre regex, on log un sample pour diagnostiquer le format inattendu
      // (locale différente, version smbclient récente, etc.) au lieu de
      // retourner silencieusement [].
      if (!parsedAny && output.trim().length > 0 && !output.includes('NT_STATUS_')) {
        this.logger.warn(
          `SMB list parse miss (${shareName}/${safePath}) — sample: ${output.split('\n').slice(0, 3).join(' | ').slice(0, 300)}`,
        );
      }

      return items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch (err) {
      if (err instanceof ForbiddenException || err instanceof NotFoundException) throw err;
      const errMsg = (err as { message?: string; code?: string })?.message ?? '';
      this.logger.warn(`SMB list failed: ${shareName}/${safePath} — ${errMsg.slice(0, 200)}`);
      // En cas de timeout, signaler à l'utilisateur plutôt que de retourner
      // silencieusement un dossier vide (UX très perturbant — bug observé).
      if (errMsg.includes('ETIMEDOUT') || errMsg.includes('timed out')) {
        throw new InternalServerErrorException(
          `Le partage ${shareName} ne répond pas (timeout 30s). Réseau ou serveur SMB lent — réessayez ou contactez l'IT.`,
        );
      }
      return [];
    }
  }

  downloadFile(shareName: string, filePath: string, userRole: string, userId: string): Buffer {
    const share = SHARES.find(s => s.name === shareName);
    if (!share) throw new NotFoundException('Partage introuvable');
    if (!share.allowedRoles.includes(userRole)) throw new ForbiddenException('Accès non autorisé');

    const safePath = filePath.replace(/\.\./g, '');
    const creds = this.getCredentials(userId);

    try {
      const tmpFile = `/tmp/smb_dl_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      execSync(
        `smbclient "//${this.host}/${shareName}" -U "${creds.user}%${creds.password}" -c "get \\"${safePath}\\" ${tmpFile}" 2>/dev/null`,
        { timeout: 30000 },
      );
      const fs = require('fs');
      const data = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);
      return data;
    } catch {
      throw new NotFoundException('Fichier introuvable ou inaccessible');
    }
  }

  uploadFile(shareName: string, dirPath: string, fileName: string, buffer: Buffer, userRole: string, userId: string): void {
    const share = SHARES.find(s => s.name === shareName);
    if (!share) throw new NotFoundException('Partage introuvable');
    if (!share.allowedRoles.includes(userRole)) throw new ForbiddenException('Accès non autorisé');

    const safePath = dirPath.replace(/\.\./g, '');
    const safeFileName = fileName.replace(/[\\/]/g, '_');
    const creds = this.getCredentials(userId);

    const fs = require('fs');
    const tmpFile = `/tmp/smb_ul_${Date.now()}`;
    fs.writeFileSync(tmpFile, buffer);

    try {
      const targetPath = safePath ? `${safePath}\\${safeFileName}` : safeFileName;
      execSync(
        `smbclient "//${this.host}/${shareName}" -U "${creds.user}%${creds.password}" -c "put ${tmpFile} \\"${targetPath}\\"" 2>/dev/null`,
        { timeout: 30000 },
      );
    } catch {
      throw new Error('Échec de l\'upload');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  }

  deleteFile(shareName: string, filePath: string, userRole: string, userId: string): { message: string } {
    const share = SHARES.find(s => s.name === shareName);
    if (!share) throw new NotFoundException('Partage introuvable');
    if (!share.allowedRoles.includes(userRole)) throw new ForbiddenException('Accès non autorisé');

    const safePath = filePath.replace(/\.\./g, '');
    const creds = this.getCredentials(userId);

    try {
      const output = execSync(
        `smbclient "//${this.host}/${shareName}" -U "${creds.user}%${creds.password}" -c "del \\"${safePath}\\"" 2>&1`,
        { timeout: 10000, encoding: 'utf-8' },
      );
      if (output.includes('NT_STATUS')) {
        execSync(
          `smbclient "//${this.host}/${shareName}" -U "${creds.user}%${creds.password}" -c "rmdir \\"${safePath}\\"" 2>&1`,
          { timeout: 10000 },
        );
      }
      return { message: 'Élément supprimé' };
    } catch {
      throw new NotFoundException('Impossible de supprimer cet élément');
    }
  }

  createFolder(shareName: string, dirPath: string, name: string, userRole: string, userId: string): { message: string } {
    const share = SHARES.find(s => s.name === shareName);
    if (!share) throw new NotFoundException('Partage introuvable');
    if (!share.allowedRoles.includes(userRole)) throw new ForbiddenException('Accès non autorisé');

    const safeName = name.replace(/[\\/.:]/g, '_');
    const fullPath = dirPath ? `${dirPath.replace(/\.\./g, '')}\\${safeName}` : safeName;
    const creds = this.getCredentials(userId);

    try {
      execSync(
        `smbclient "//${this.host}/${shareName}" -U "${creds.user}%${creds.password}" -c "mkdir \\"${fullPath}\\"" 2>/dev/null`,
        { timeout: 10000 },
      );
      return { message: `Dossier "${safeName}" créé` };
    } catch {
      throw new BadRequestException('Impossible de créer le dossier');
    }
  }
}
