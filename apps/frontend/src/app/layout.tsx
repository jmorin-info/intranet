import type { Metadata } from "next";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { DarkModeInit } from "@/components/dark-mode-init";
import { ChunkErrorRecovery } from "@/components/chunk-error-recovery";
import { ThemeStyles } from "@/components/theme-styles";

export const metadata: Metadata = {
  title: "OMNITECH Security — Intranet",
  description:
    "Portail intranet sécurisé OMNITECH Security — Gestion documentaire et collaboration",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // CSP nonce, émis par middleware.ts. Indispensable pour autoriser les
  // <script> inline (dark-mode init, SW unregister, chunk error recovery)
  // sous une CSP strict-dynamic.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // next-intl : locale + messages négociés par src/i18n/request.ts.
  // `lang` est posé sur <html> pour conformité a11y (WCAG 3.1.1).
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta name="robots" content="noindex, nofollow" />
        {/* Icons : multi-size explicit pour que Windows / macOS / iOS / Android
            prennent le bon fichier selon le contexte (tab, taskbar, home screen).
            ?v=3 sur chaque URL force les clients PWA à télécharger la nouvelle
            série d'icônes OMNITECH Security après leur install précédente. */}
        <link
          rel="icon"
          type="image/x-icon"
          href="/favicon.ico?v=3"
          sizes="any"
        />
        <link
          rel="icon"
          type="image/png"
          href="/icon-32.png?v=3"
          sizes="32x32"
        />
        <link
          rel="icon"
          type="image/png"
          href="/icon-192.png?v=3"
          sizes="192x192"
        />
        <link rel="apple-touch-icon" href="/icon-180.png?v=3" sizes="180x180" />
        <link rel="manifest" href="/manifest.json?v=3" />
        <meta name="theme-color" content="#F68D2E" />
        <meta name="application-name" content="OMNITECH Security" />
        <meta name="apple-mobile-web-app-title" content="OMNITECH Security" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileImage" content="/icon-192.png?v=3" />
        <meta name="msapplication-TileColor" content="#F68D2E" />
        {/* CMS-driven theme overrides — surcharge sélective des CSS vars
            SEAL (couleurs / fontes / rayons). Vide si bloc `theme.tokens`
            inexistant ou tous les champs invalides — pas de régression. */}
        <ThemeStyles nonce={nonce} />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('darkMode')==='true')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
      if ('serviceWorker' in navigator) {
        // Register the OMNITECH service worker (public/sw.js).
        // ISO 27001 A.5.30 — ICT readiness for business continuity.
        // The SW handles offline fallback, static asset caching, and safe
        // GET API stale-while-revalidate. CSP-safe: /sw.js is excluded from
        // the nonce-based CSP rewrite by middleware.ts.
        window.addEventListener('load', function() {
          navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function() {});
        });

        // ChunkLoadError recovery — keep purge fallback only on chunk error.
        window.addEventListener('error', function(e) {
          var msg = (e && (e.message || (e.error && e.error.message))) || '';
          if (/Loading chunk [^ ]+ failed|ChunkLoadError/i.test(msg)) {
            if (window.__chunkRecoveryDone) return;
            window.__chunkRecoveryDone = true;
            // Purge SW + caches before reload to avoid serving the stale chunk again.
            navigator.serviceWorker.getRegistrations().then(function(regs) {
              return Promise.all(regs.map(function(r) { return r.unregister(); }));
            }).catch(function() {}).finally(function() {
              if (typeof caches !== 'undefined') {
                caches.keys().then(function(keys) {
                  return Promise.all(keys.map(function(k) { return caches.delete(k); }));
                }).catch(function() {}).finally(function() { window.location.reload(); });
              } else {
                window.location.reload();
              }
            });
          }
        });
      }
    `,
          }}
        />
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <div id="__app" suppressHydrationWarning>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <ChunkErrorRecovery />
            {children}
            <Toaster
              position="top-center"
              richColors
              closeButton
              toastOptions={{ style: { fontFamily: "var(--font-body)" } }}
            />
          </NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}
