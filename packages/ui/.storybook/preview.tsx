import React from 'react';
import type { Preview } from '@storybook/react';
import { withThemeByClassName } from '@storybook/addon-themes';
import './preview.css';

/**
 * Storybook 8 — preview @omnitech/ui
 *
 * - Charge `preview.css` (Tailwind + tokens SEAL).
 * - Toggle Light/Dark via `@storybook/addon-themes` qui pose la classe
 *   `dark` sur l'élément racine (cohérent avec `darkMode: 'class'` Tailwind
 *   du frontend).
 * - Tous les écrans sont rendus avec la stack typo OMNITECH (Century Gothic
 *   → Nunito) + `antialiased`.
 */
const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'surface',
      values: [
        { name: 'surface', value: '#F5F5F5' },
        { name: 'white', value: '#FFFFFF' },
        { name: 'navy', value: '#004469' },
      ],
    },
    layout: 'centered',
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
    (Story) => (
      <div className="font-sans antialiased text-seal-navy dark:text-white p-4 min-w-[320px]">
        <Story />
      </div>
    ),
  ],
};

export default preview;
