import { describe, it, expect } from 'vitest';
import { BREADCRUMBS_LABELS, humanizeSegment, isDynamicSegment } from '../breadcrumbs-labels';

describe('breadcrumbs-labels', () => {
  describe('humanizeSegment', () => {
    it('capitalise la première lettre', () => {
      expect(humanizeSegment('tickets')).toBe('Tickets');
    });

    it('remplace les tirets par des espaces', () => {
      expect(humanizeSegment('ticket-spaces')).toBe('Ticket spaces');
    });

    it('remplace les underscores par des espaces', () => {
      expect(humanizeSegment('system_health')).toBe('System health');
    });

    it('gère une chaîne vide', () => {
      expect(humanizeSegment('')).toBe('');
    });
  });

  describe('isDynamicSegment', () => {
    it('détecte un UUID v4', () => {
      expect(isDynamicSegment('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('rejette les labels courts (même avec des tirets)', () => {
      expect(isDynamicSegment('ticket-spaces')).toBe(false);
      expect(isDynamicSegment('rssi')).toBe(false);
    });

    it('détecte un long slug comme dynamique', () => {
      expect(isDynamicSegment('ma-super-procedure-de-renouvellement-annuel')).toBe(true);
    });

    it('rejette un label normal', () => {
      expect(isDynamicSegment('documents')).toBe(false);
    });
  });

  describe('BREADCRUMBS_LABELS mapping', () => {
    it('contient les labels principaux de navigation', () => {
      expect(BREADCRUMBS_LABELS.dashboard?.label).toBe('Tableau de bord');
      expect(BREADCRUMBS_LABELS.tickets?.label).toBe('Tickets');
      expect(BREADCRUMBS_LABELS.wiki?.label).toBe('Wiki');
      expect(BREADCRUMBS_LABELS.media?.label).toBe('Médiathèque');
      expect(BREADCRUMBS_LABELS.admin?.label).toBe('Administration');
    });

    it('contient les sous-routes admin critiques', () => {
      expect(BREADCRUMBS_LABELS.feedback?.label).toBe('Avis & enquêtes');
      expect(BREADCRUMBS_LABELS['system-monitoring']?.label).toBe('Monitoring système');
      expect(BREADCRUMBS_LABELS['ticket-spaces']?.label).toBe('Espaces de ticketing');
    });
  });
});
