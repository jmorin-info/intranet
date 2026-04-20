'use client';

/**
 * UI State Selectors — Fine-grained Zustand selectors for components.
 *
 * Using selectors instead of reading the full store prevents
 * unnecessary re-renders when unrelated state fields change.
 */

import { useUIStateStore } from './ui-state-store';

/** Read density setting */
export const useUIDensity = () => useUIStateStore(s => s.density);

/** Read full visibility object */
export const useUIVisibility = () => useUIStateStore(s => s.visibility);

/** Read a single visibility flag */
export const useUIVisible = (key: keyof ReturnType<typeof useUIVisibility>) =>
  useUIStateStore(s => s.visibility[key]);

/** Read full emphasis object */
export const useUIEmphasis = () => useUIStateStore(s => s.emphasis);

/** Read layout mode */
export const useUILayout = () => useUIStateStore(s => s.layout);

/** Read whether any adaptive mutation is active (vs default state) */
export const useUIAdapted = () =>
  useUIStateStore(s =>
    s.density !== 'default' ||
    !s.visibility.secondaryPanels ||
    !s.visibility.analyticsWidgets ||
    s.emphasis.statusDropdown ||
    s.emphasis.searchFocus ||
    s.emphasis.bulkMode,
  );
