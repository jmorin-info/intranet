import type { Metadata } from "next";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";
import { DarkModeInit } from "@/components/dark-mode-init";
import { ChunkErrorRecovery } from "@/components/chunk-error-recovery";

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

  return (
    <html lang="fr" suppressHydrationWarning>
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
        <meta name="theme-color" content="#004469" />
        <meta name="application-name" content="OMNITECH Security" />
        <meta name="apple-mobile-web-app-title" content="OMNITECH Security" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileImage" content="/icon-192.png?v=3" />
        <meta name="msapplication-TileColor" content="#004469" />
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
        // TEMPORARY: purge all service workers and caches after major rebuild session.
        // This ensures all clients get fresh assets. Re-enable SW registration after cleanup.
        navigator.serviceWorker.getRegistrations().then(function(regs) {
          Promise.all(regs.map(function(r) { return r.unregister(); }));
          if (typeof caches !== 'undefined') {
            caches.keys().then(function(keys) {
              keys.forEach(function(k) { caches.delete(k); });
            });
          }
        }).catch(function() {});

        // ChunkLoadError recovery
        window.addEventListener('error', function(e) {
          var msg = (e && (e.message || (e.error && e.error.message))) || '';
          if (/Loading chunk [^ ]+ failed|ChunkLoadError/i.test(msg)) {
            if (window.__chunkRecoveryDone) return;
            window.__chunkRecoveryDone = true;
            window.location.reload();
          }
        });
      }
    `,
          }}
        />
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <div id="__app" suppressHydrationWarning>
          <ChunkErrorRecovery />
          {children}
          <Toaster
            position="top-center"
            richColors
            closeButton
            toastOptions={{ style: { fontFamily: "var(--font-body)" } }}
          />
        </div>
      </body>
    </html>
  );
}
