import { Injectable, Logger } from '@nestjs/common';

/**
 * Sanitizer PII pour l'ingestion RAG (P1.7.1.2).
 * Masque les données personnelles avant indexation dans le vector store.
 * ISO 27001 Annex A.5.34 (protection PII).
 */

export interface SanitizationReport {
  maskedEmails: number;
  maskedIps: number;
  maskedPhones: number;
  maskedHostnames: number;
  totalMasked: number;
  requiresHumanReview: boolean;
}

export interface SanitizedResult {
  text: string;
  report: SanitizationReport;
}

// Patterns PII
const PATTERNS: Array<{ name: keyof Omit<SanitizationReport, 'totalMasked' | 'requiresHumanReview'>; regex: RegExp; replacement: string }> = [
  {
    name: 'maskedEmails',
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    replacement: '<EMAIL>',
  },
  {
    name: 'maskedIps',
    regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
    replacement: '<IP_INTERNE>',
  },
  {
    name: 'maskedPhones',
    regex: /\b0[1-9](?:[\s.-]?\d{2}){4}\b/g,
    replacement: '<TELEPHONE>',
  },
  {
    name: 'maskedHostnames',
    regex: /\b[A-Z]{2,4}-[A-Z]{2,6}-\d{2}-[A-Z]{2,4}-VM\b/gi,
    replacement: '<HOSTNAME>',
  },
];

const HUMAN_REVIEW_THRESHOLD = 5;

@Injectable()
export class PiiSanitizerService {
  private readonly logger = new Logger(PiiSanitizerService.name);

  /**
   * Sanitize un texte en masquant les PII détectées.
   * Retourne le texte nettoyé + un rapport de sanitization.
   */
  sanitize(text: string): SanitizedResult {
    let sanitized = text;
    const report: SanitizationReport = {
      maskedEmails: 0,
      maskedIps: 0,
      maskedPhones: 0,
      maskedHostnames: 0,
      totalMasked: 0,
      requiresHumanReview: false,
    };

    for (const pattern of PATTERNS) {
      const matches = sanitized.match(pattern.regex);
      if (matches) {
        report[pattern.name] = matches.length;
        report.totalMasked += matches.length;
        sanitized = sanitized.replace(pattern.regex, pattern.replacement);
      }
    }

    report.requiresHumanReview = report.totalMasked > HUMAN_REVIEW_THRESHOLD;

    if (report.totalMasked > 0) {
      this.logger.log({
        msg: 'pii.sanitized',
        ...report,
      });
    }

    return { text: sanitized, report };
  }
}
