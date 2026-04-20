import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';
import { DarkModeInit } from '@/components/dark-mode-init';
import { ChunkErrorRecovery } from '@/components/chunk-error-recovery';

export const metadata: Metadata = {
  title: 'OMNITECH Security — Intranet',
  description: 'Portail intranet sécurisé OMNITECH Security — Gestion documentaire et collaboration',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#004469" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('darkMode')==='true')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <script
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
            position="top-right"
            richColors
            closeButton
            toastOptions={{ style: { fontFamily: "var(--font-body)" } }}
          />
        </div>
      </body>
    </html>
  );
}
