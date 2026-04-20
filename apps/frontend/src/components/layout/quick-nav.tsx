'use client';

/**
 * @deprecated QuickNav a été remplacé par la nouvelle Command Palette
 * (`components/layout/command-palette.tsx`). Ce fichier est conservé pour ne
 * pas casser les imports existants (ex: `app/(app)/layout.tsx`). Il ne rend
 * rien et n'installe AUCUN listener clavier — la gestion de Cmd/Ctrl+K est
 * désormais assurée par `CommandPaletteProvider`, monté depuis `AuthProvider`.
 *
 * Pour ouvrir la palette par code : `useCommandPalette().open()`.
 */

export function QuickNav(): null {
  return null;
}

// Ré-export pour ceux qui voudraient importer directement depuis quick-nav
export { CommandPalette } from './command-palette';
