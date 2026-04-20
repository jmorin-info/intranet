import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config minimale pour l'app frontend.
 *
 * On cible uniquement des modules de logique pure (parsers, validateurs)
 * pour l'instant — le rendu React n'est pas testé en unitaire, c'est du
 * ressort de l'E2E Playwright.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
