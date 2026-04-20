import type { Config } from 'tailwindcss';

/**
 * OMNITECH Security — Tailwind theme
 *
 * Couleurs PANTONE officielles (charte SEAL System / OMNITECH SECURITY) :
 *   - Orange   PANTONE 715C → #F9964A   (variante moderne : #F68D2E pour Web)
 *   - Bleu     PANTONE 660C → #296DC1
 *   - Vert     PANTONE 349C → #006233
 *   - Bordeaux PANTONE 202C → #892034
 *
 * La couleur primary (#F68D2E) est l'évolution numérique du PANTONE 715C original.
 * Les couleurs SEAL System d'origine sont disponibles via les classes `seal-*`
 * pour assurer une cohérence visuelle avec le produit de sécurité physique.
 */
const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
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
        // ===== Couleurs PANTONE officielles OMNITECH SECURITY =====
        seal: {
          orange: '#F9964A',      // PANTONE 715C
          'orange-light': '#FFCC99',
          blue: '#296DC1',        // PANTONE 660C
          green: '#006233',       // PANTONE 349C
          bordeaux: '#892034',    // PANTONE 202C
          navy: '#004469',        // Bleu OMNITECH historique (renommage sémantique du token `navy` legacy)
          gray: {
            100: '#dadde2',
            300: '#8f94a4',
            400: '#676d7f',
            500: '#454955',
            600: '#3c3f4a',
          },
          // États d'alarme SEAL (système de sécurité)
          alarm: {
            new: '#cc0000',       // Nouvelle alarme — rouge vif
            normal: '#762323',    // Norme/active — bordeaux foncé
            ack: '#c68200',       // Acquittée — orange foncé
            ended: '#70916a',     // Terminée — vert atténué
          },
        },
        surface: '#F5F5F5',
        card: '#FFFFFF',
      },
      fontFamily: {
        body: ["'Century Gothic'", "'CenturyGothic'", "'AppleGothic'", "'Nunito'", "'Trebuchet MS'", 'sans-serif'],
        // display = identique à body (on évite Impact qui est trop "stade de foot")
        display: ["'Century Gothic'", "'CenturyGothic'", "'AppleGothic'", "'Nunito'", "'Trebuchet MS'", 'sans-serif'],
        // Verdana = police historique SEAL System (utilisée pour compat visuelle modules legacy)
        seal: ["'Verdana'", "'Geneva'", 'sans-serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
        // 6px = border-radius default SEAL System
        seal: '6px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 68, 105, 0.08)',
        'card-hover': '0 4px 12px rgba(0, 68, 105, 0.15)',
        // Ombre douce style SEAL (panneaux flottants)
        seal: '0 2px 8px rgba(60, 63, 74, 0.15)',
        'seal-lg': '0 8px 24px rgba(60, 63, 74, 0.18)',
      },
      backgroundImage: {
        // Gradient signature SEAL : blanc vers orange (utilisé pour headers/labels)
        'seal-orange': 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(249,150,74,1) 100%)',
        // Gradient sombre style visio SEAL
        'seal-dark': 'linear-gradient(180deg, rgba(48,48,48,1) 0%, rgba(0,0,0,1) 100%)',
        // Gradient subtil pour cards
        'seal-soft': 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(254,240,218,0.6) 100%)',
      },
      height: {
        // Input height SEAL = 40px
        input: '40px',
      },
    },
  },
  plugins: [],
};

export default config;
