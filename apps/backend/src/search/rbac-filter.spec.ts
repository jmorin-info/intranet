import { allowedClassifications, canViewHit } from './rbac-filter';
import { UserRole } from '../common/enums';

describe('search/rbac-filter', () => {
  describe('allowedClassifications', () => {
    it('SUPER_ADMIN a accès à toutes les classifications', () => {
      expect(allowedClassifications(UserRole.SUPER_ADMIN)).toEqual(
        expect.arrayContaining(['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET']),
      );
    });

    it('ADMIN a accès à toutes les classifications', () => {
      expect(allowedClassifications(UserRole.ADMIN)).toEqual(
        expect.arrayContaining(['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET']),
      );
    });

    it('REVIEWER accède PUBLIC/INTERNE/CONFIDENTIEL mais pas SECRET', () => {
      const cls = allowedClassifications(UserRole.REVIEWER);
      expect(cls).toContain('PUBLIC');
      expect(cls).toContain('INTERNE');
      expect(cls).toContain('CONFIDENTIEL');
      expect(cls).not.toContain('SECRET');
    });

    it('COLLABORATEUR accède PUBLIC/INTERNE mais pas CONFIDENTIEL/SECRET', () => {
      const cls = allowedClassifications(UserRole.COLLABORATEUR);
      expect(cls).toContain('PUBLIC');
      expect(cls).toContain('INTERNE');
      expect(cls).not.toContain('CONFIDENTIEL');
      expect(cls).not.toContain('SECRET');
    });

    it('PRESTATAIRE accède PUBLIC/INTERNE uniquement', () => {
      const cls = allowedClassifications(UserRole.PRESTATAIRE);
      expect(cls).toContain('PUBLIC');
      expect(cls).toContain('INTERNE');
      expect(cls).not.toContain('CONFIDENTIEL');
      expect(cls).not.toContain('SECRET');
    });

    it('sans rôle, n\'accorde que PUBLIC', () => {
      expect(allowedClassifications(undefined)).toEqual(['PUBLIC']);
    });
  });

  describe('canViewHit', () => {
    const admin = { id: 'admin-1', role: UserRole.ADMIN };
    const collab = { id: 'collab-1', role: UserRole.COLLABORATEUR };
    const presta = { id: 'presta-1', role: UserRole.PRESTATAIRE };

    it('bloque un document SECRET pour un COLLABORATEUR', () => {
      const hit = { type: 'document', classification: 'SECRET', authorId: 'other' };
      expect(canViewHit(hit, collab)).toBe(false);
    });

    it('autorise un document SECRET pour un ADMIN', () => {
      const hit = { type: 'document', classification: 'SECRET', authorId: 'other' };
      expect(canViewHit(hit, admin)).toBe(true);
    });

    it('autorise un document SECRET pour son auteur (owner bypass)', () => {
      const hit = { type: 'document', classification: 'SECRET', authorId: 'collab-1' };
      expect(canViewHit(hit, collab)).toBe(true);
    });

    it('bloque un document CONFIDENTIEL pour un PRESTATAIRE', () => {
      const hit = { type: 'document', classification: 'CONFIDENTIEL', authorId: 'other' };
      expect(canViewHit(hit, presta)).toBe(false);
    });

    it('autorise un document PUBLIC pour tous les rôles', () => {
      const hit = { type: 'document', classification: 'PUBLIC' };
      expect(canViewHit(hit, admin)).toBe(true);
      expect(canViewHit(hit, collab)).toBe(true);
      expect(canViewHit(hit, presta)).toBe(true);
    });

    it('autorise un document INTERNE pour PRESTATAIRE (borderline)', () => {
      const hit = { type: 'document', classification: 'INTERNE' };
      expect(canViewHit(hit, presta)).toBe(true);
    });

    it('traite classification absente comme INTERNE (défaut sécurité)', () => {
      const hit = { type: 'document', classification: null };
      expect(canViewHit(hit, presta)).toBe(true); // INTERNE OK pour PRESTATAIRE
      const restricted = { id: 'anon', role: undefined as unknown as UserRole };
      expect(canViewHit(hit, restricted)).toBe(false);
    });

    it('autorise les hits non-document (tickets/wiki/news) sans filtrer', () => {
      expect(canViewHit({ type: 'ticket' }, collab)).toBe(true);
      expect(canViewHit({ type: 'wiki' }, collab)).toBe(true);
      expect(canViewHit({ type: 'news' }, collab)).toBe(true);
    });

    it('bloque si user est null ou undefined', () => {
      const hit = { type: 'document', classification: 'PUBLIC' };
      expect(canViewHit(hit, null)).toBe(false);
      expect(canViewHit(hit, undefined)).toBe(false);
    });
  });
});
