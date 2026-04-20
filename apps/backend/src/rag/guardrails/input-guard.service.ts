import { Injectable, Logger } from '@nestjs/common';

/**
 * Guardrails d'entrée pour le pipeline RAG (P0.2).
 * Valide et assainit les requêtes utilisateur avant injection dans le LLM.
 *
 * Règles :
 * 1. Longueur max 2000 caractères
 * 2. Détection injection prompt basique
 * 3. Sanitization caractères de contrôle
 * 4. Normalisation Unicode NFC
 */

export interface InputGuardResult {
  allowed: boolean;
  reason?: string;
  sanitizedQuery: string;
}

// Patterns d'injection prompt connus
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(tout|toutes)\s+(les\s+)?instructions/i,
  /system\s*:\s*/i,
  /<\/?prompt>/i,
  /<\/?system>/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<<SYS>>/i,
  /you\s+are\s+now\s+(a|an)\s/i,
  /tu\s+es\s+maintenant\s/i,
  /oublie\s+(tout|tes\s+instructions)/i,
  /forget\s+(all|your)\s+(instructions|rules)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
];

const MAX_QUERY_LENGTH = 2000;

@Injectable()
export class InputGuardService {
  private readonly logger = new Logger(InputGuardService.name);

  /**
   * Valide et assainit une requête utilisateur.
   * Retourne un objet avec le statut et la requête nettoyée.
   */
  validate(query: string, userId?: string): InputGuardResult {
    // Sanitization : strip control chars + normalisation NFC
    const sanitized = this.sanitize(query);

    // Règle 1 : longueur
    if (sanitized.length > MAX_QUERY_LENGTH) {
      this.logger.warn({
        msg: 'input_guard.rejected.length',
        userId,
        length: sanitized.length,
        max: MAX_QUERY_LENGTH,
      });
      return {
        allowed: false,
        reason: `La question dépasse la limite de ${MAX_QUERY_LENGTH} caractères.`,
        sanitizedQuery: sanitized.slice(0, MAX_QUERY_LENGTH),
      };
    }

    // Règle 2 : détection injection
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        this.logger.warn({
          msg: 'input_guard.rejected.injection',
          userId,
          pattern: pattern.source,
          queryPreview: sanitized.slice(0, 50),
        });
        return {
          allowed: false,
          reason: 'La requête contient un pattern non autorisé.',
          sanitizedQuery: sanitized,
        };
      }
    }

    // Règle 3 : longueur minimale (après sanitization)
    if (sanitized.trim().length < 2) {
      return {
        allowed: false,
        reason: 'La question est trop courte.',
        sanitizedQuery: sanitized,
      };
    }

    return {
      allowed: true,
      sanitizedQuery: sanitized,
    };
  }

  /**
   * Assainit une chaîne : supprime les caractères de contrôle,
   * normalise en NFC, trim.
   */
  private sanitize(input: string): string {
    return input
      // Supprime les caractères de contrôle (sauf newline et tab)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalise Unicode NFC
      .normalize('NFC')
      // Collapse whitespace excessif
      .replace(/\s{3,}/g, '  ')
      .trim();
  }
}
