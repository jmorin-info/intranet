import type { Config } from 'tailwindcss';

/**
 * Tailwind config — @omnitech/ui (Storybook)
 *
 * Reflet du `apps/frontend/tailwind.config.ts`. Tient en miroir les classes
 * `seal-*`, `primary-*`, `navy`, etc. utilisées dans les composants pour que
 * Storybook puisse styler les variants sans dépendre du frontend.
 */
const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './.storybook/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#F68D2E',
          dark: '#d97420',
          light: '#FEF3E2',
          50: '#FEF7EF',
          100: '#FEF0DA',
          200: '#FCD9A8',
          300: '#FBC078',
          400: '#F9A769',
          500: '#F68D2E',
          600: '#e67d1e',
          700: '#c46714',
          800: '#9a4f0e',
          900: '#7a3f0c',
        },
        navy: {
          DEFAULT: '#004469',
          light: 'rgba(0, 68, 105, 0.08)',
          50: '#E6EEF3',
          500: '#004469',
          700: '#003654',
          900: '#00253B',
        },
        taupe: {
          DEFAULT: '#837274',
        },
        seal: {
          orange: '#F9964A',
          'orange-light': '#FFCC99',
          blue: '#296DC1',
          green: '#006233',
          bordeaux: '#892034',
          navy: '#004469',
          taupe: '#837274',
          gray: {
            100: '#dadde2',
            300: '#8f94a4',
            400: '#676d7f',
            500: '#454955',
            600: '#3c3f4a',
          },
          alarm: {
            new: '#cc0000',
            normal: '#762323',
            ack: '#c68200',
            ended: '#70916a',
          },
        },
        surface: '#F5F5F5',
        card: '#FFFFFF',
      },
      fontFamily: {
        sans: [
          "'Century Gothic'",
          "'CenturyGothic'",
          "'AppleGothic'",
          "'Nunito'",
          "'Trebuchet MS'",
          'sans-serif',
        ],
        body: [
          "'Century Gothic'",
          "'CenturyGothic'",
          "'AppleGothic'",
          "'Nunito'",
          "'Trebuchet MS'",
          'sans-serif',
        ],
        display: [
          "'Century Gothic'",
          "'CenturyGothic'",
          "'AppleGothic'",
          "'Nunito'",
          "'Trebuchet MS'",
          'sans-serif',
        ],
        seal: ["'Verdana'", "'Geneva'", 'sans-serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
        seal: '6px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 68, 105, 0.08)',
        'card-hover': '0 4px 12px rgba(0, 68, 105, 0.15)',
        seal: '0 2px 8px rgba(60, 63, 74, 0.15)',
        'seal-lg': '0 8px 24px rgba(60, 63, 74, 0.18)',
      },
      backgroundImage: {
        'seal-orange':
          'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(249,150,74,1) 100%)',
        'seal-dark':
          'linear-gradient(180deg, rgba(48,48,48,1) 0%, rgba(0,0,0,1) 100%)',
        'seal-soft':
          'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(254,240,218,0.6) 100%)',
      },
      height: {
        input: '40px',
      },
    },
  },
  plugins: [],
};

export default config;
