import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * HaveIBeenPwned password check via the k-anonymity API.
 *
 * On envoie uniquement les 5 premiers caractères du SHA-1 du mot de passe
 * (https://api.pwnedpasswords.com/range/{prefix}) et on reçoit une liste de
 * suffixes + nombre d'occurrences. Le mot de passe complet ne quitte JAMAIS
 * le serveur — conforme RGPD + ANSSI R20 (vérification fuites de credentials).
 *
 * Configurable via :
 *   - HIBP_ENABLED=true|false  (défaut true)
 *   - HIBP_THRESHOLD=<N>       (défaut 100 — refuser si pwned > N occurrences)
 *
 * Graceful degradation : si l'API HIBP est indisponible (timeout, erreur réseau,
 * 5xx), on log un warning mais on accepte le mot de passe — éviter de bloquer
 * l'utilisateur en cas de panne externe (le reste de la politique MDP s'applique).
 */
@Injectable()
export class HibpService {
  private readonly logger = new Logger(HibpService.name);
  private readonly enabled: boolean;
  private readonly threshold: number;

  constructor() {
    // HIBP_ENABLED défaut true — on protège par défaut
    this.enabled = (process.env.HIBP_ENABLED ?? 'true').toLowerCase() !== 'false';
    const raw = parseInt(process.env.HIBP_THRESHOLD || '100', 10);
    this.threshold = Number.isFinite(raw) && raw > 0 ? raw : 100;
  }

  /**
   * Interroge l'API HIBP en k-anonymity.
   * @returns { pwned: boolean; count: number } — pwned=false si HIBP désactivé/down.
   */
  async isPasswordPwned(password: string): Promise<{ pwned: boolean; count: number }> {
    if (!this.enabled) {
      return { pwned: false, count: 0 };
    }

    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: {
          'User-Agent': 'OMNITECH-Intranet',
          'Add-Padding': 'true', // recommandé par HIBP pour limiter le fingerprinting
        },
        signal: AbortSignal.timeout(3000),
      });

      if (!res.ok) {
        this.logger.warn(`HIBP API returned non-OK status ${res.status} — accepting password (graceful degradation)`);
        return { pwned: false, count: 0 };
      }

      const text = await res.text();
      for (const line of text.split('\n')) {
        const [hashSuffix, countStr] = line.trim().split(':');
        if (hashSuffix === suffix) {
          const count = parseInt(countStr, 10);
          return { pwned: true, count: Number.isFinite(count) ? count : 0 };
        }
      }
      return { pwned: false, count: 0 };
    } catch (err) {
      // Timeout, DNS, réseau, etc. — on log mais on accepte (graceful degradation)
      this.logger.warn(
        `HIBP check failed (graceful degradation): ${err instanceof Error ? err.message : String(err)}`,
      );
      return { pwned: false, count: 0 };
    }
  }

  /**
   * Helper qui throw une BadRequestException si le mot de passe est compromis
   * au-delà du seuil configuré. À appeler depuis les services de gestion MDP.
   */
  async assertPasswordNotPwned(password: string): Promise<void> {
    const { pwned, count } = await this.isPasswordPwned(password);
    if (pwned && count > this.threshold) {
      throw new BadRequestException(
        `Ce mot de passe a été détecté dans une fuite de données (${count} fois). Veuillez en choisir un autre.`,
      );
    }
  }

  /** Exposed for tests / introspection. */
  getThreshold(): number {
    return this.threshold;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
