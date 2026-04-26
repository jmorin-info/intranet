import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook 8 — configuration @omnitech/ui
 *
 * Couvre toutes les stories `.stories.tsx` placées à côté des composants
 * dans `src/`. Tailwind est compilé via PostCSS sur `preview.css`.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-themes',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    // On garde la vérification de types côté `pnpm typecheck`,
    // pas besoin de la rejouer dans Storybook (gain perf).
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  docs: {
    autodocs: 'tag',
  },
  core: {
    disableTelemetry: true,
  },
};

export default config;
