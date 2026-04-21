import { describe, it, expect } from 'vitest';
import { isTrackablePath } from '../use-recent-pages';

describe('use-recent-pages — isTrackablePath', () => {
  describe('chemins trackables', () => {
    it('accepte une page fonctionnelle classique', () => {
      expect(isTrackablePath('/tickets')).toBe(true);
      expect(isTrackablePath('/documents/abc-123')).toBe(true);
      expect(isTrackablePath('/wiki/some-page')).toBe(true);
    });

    it('accepte les sous-routes admin', () => {
      expect(isTrackablePath('/admin/users')).toBe(true);
      expect(isTrackablePath('/admin/feedback')).toBe(true);
    });

    it('accepte les pages de détail avec UUIDs', () => {
      expect(isTrackablePath('/incidents/550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });
  });

  describe('chemins bloqués', () => {
    it('bloque la racine et le dashboard', () => {
      expect(isTrackablePath('/')).toBe(false);
      expect(isTrackablePath('/dashboard')).toBe(false);
    });

    it('bloque les pages auth', () => {
      expect(isTrackablePath('/login')).toBe(false);
      expect(isTrackablePath('/logout')).toBe(false);
      expect(isTrackablePath('/mfa')).toBe(false);
      expect(isTrackablePath('/reset-password')).toBe(false);
      expect(isTrackablePath('/forgot-password')).toBe(false);
      expect(isTrackablePath('/auth/callback')).toBe(false);
    });

    it('bloque les pages techniques', () => {
      expect(isTrackablePath('/offline')).toBe(false);
      expect(isTrackablePath('/maintenance')).toBe(false);
      expect(isTrackablePath('/chartes')).toBe(false);
      expect(isTrackablePath('/en-construction')).toBe(false);
    });

    it('bloque les pages d\'erreur', () => {
      expect(isTrackablePath('/404')).toBe(false);
      expect(isTrackablePath('/500')).toBe(false);
      expect(isTrackablePath('/error')).toBe(false);
      expect(isTrackablePath('/not-found')).toBe(false);
    });

    it('bloque les sous-routes des prefixes bloqués', () => {
      expect(isTrackablePath('/login/callback')).toBe(false);
      expect(isTrackablePath('/auth/provider')).toBe(false);
    });

    it('rejette les chemins vides', () => {
      expect(isTrackablePath('')).toBe(false);
    });
  });

  describe('résistance aux variations', () => {
    it('n\'est pas confondu par des préfixes partiels', () => {
      expect(isTrackablePath('/loginhelper')).toBe(true);
      expect(isTrackablePath('/auth-tools')).toBe(true);
    });
  });
});
