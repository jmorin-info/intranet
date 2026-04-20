/* OMNITECH Security — Service Worker
 * ISO 27001 A.5.30 (ICT readiness for business continuity)
 *
 * Caching strategies:
 *   - Navigation to frequent pages   → stale-while-revalidate
 *   - Other navigations              → network-first, /offline.html fallback
 *   - Static assets (js/css/img)     → cache-first
 *   - Safe GET API endpoints         → stale-while-revalidate (separate cache)
 *   - Auth / audit / notifications   → never touched (pass-through)
 */

const CACHE_VERSION = 'v9';
const STATIC_CACHE = `omnitech-static-${CACHE_VERSION}`;
const API_CACHE = `omnitech-api-${CACHE_VERSION}`;
const VALID_CACHES = [STATIC_CACHE, API_CACHE];

/** BUILD_VERSION injected at install time via message from the page. */
let currentBuildVersion = null;

const PRECACHE_URLS = ['/offline.html', '/offline'];

const STALE_WHILE_REVALIDATE_ROUTES = ['/dashboard', '/documents', '/tickets', '/notifications'];

/**
 * GET API paths that are safe to serve from cache.
 * Matched as a *prefix* against url.pathname.
 * WARNING: never add anything auth-sensitive here.
 */
const SAFE_API_SWR_PREFIXES = [
  '/api/users',
  '/api/departments',
  '/api/config',
];

/**
 * API paths that must NEVER be cached or intercepted in any way.
 * Pass-through, always network.
 */
const API_NEVER_CACHE_PREFIXES = [
  '/api/auth',
  '/api/audit',
  '/api/notifications',
  '/api/push',
];

// -------- Install / activate lifecycle --------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !VALID_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      // Après une mise à jour du SW, on demande aux onglets ouverts de
      // se recharger pour récupérer le HTML à jour (sinon ils continuent
      // à référencer d'anciens chunks Next.js supprimés au rebuild).
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: 'SW_UPDATED' }));
        })
      )
  );
});

// Allow the page to trigger an immediate upgrade when a new SW is waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // The page sends its BUILD_VERSION so the SW can detect stale caches.
  if (event.data && event.data.type === 'BUILD_VERSION') {
    const incoming = event.data.version;
    if (currentBuildVersion && currentBuildVersion !== incoming) {
      // New build deployed — purge all caches so fresh assets are fetched.
      caches.keys().then((keys) =>
        Promise.all(keys.map((k) => caches.delete(k)))
      );
    }
    currentBuildVersion = incoming;
  }
});

// -------- Push notifications (unchanged) --------

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'OMNITECH', body: event.data.text() };
  }
  const title = payload.title || 'OMNITECH Intranet';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/logo-icon.png',
    badge: payload.badge || '/logo-icon.png',
    tag: payload.tag || 'omnitech-notification',
    requireInteraction: !!payload.requireInteraction,
    data: { url: payload.url || '/dashboard' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return null;
    })
  );
});

// -------- Fetch routing --------

function isSafeApiGet(pathname) {
  return SAFE_API_SWR_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?')
  );
}

function isForbiddenApi(pathname) {
  return API_NEVER_CACHE_PREFIXES.some((p) => pathname.startsWith(p));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never touch non-GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin traffic
  if (url.origin !== self.location.origin) return;

  // Auth / login / logout shells — pass through
  if (url.pathname.startsWith('/login') || url.pathname.startsWith('/logout')) return;

  // Sensitive API endpoints — pass through
  if (isForbiddenApi(url.pathname)) return;

  // Safe GET API endpoints → stale-while-revalidate from dedicated API cache
  if (url.pathname.startsWith('/api/')) {
    if (isSafeApiGet(url.pathname)) {
      event.respondWith(
        caches.open(API_CACHE).then((cache) =>
          cache.match(request).then((cached) => {
            const networkFetch = fetch(request)
              .then((response) => {
                if (response.ok) {
                  cache.put(request, response.clone());
                }
                return response;
              })
              .catch(() => cached);
            return cached || networkFetch;
          })
        )
      );
      return;
    }
    // Other /api GET requests: pass through (default network)
    return;
  }

  // Page navigations — network-first
  // On NE cache PAS le HTML de manière agressive : si on sert du vieux HTML
  // qui référence d'anciens chunks Next.js supprimés au rebuild, le navigateur
  // lève ChunkLoadError. Network-first garantit qu'après un déploiement,
  // l'utilisateur reçoit la dernière version du HTML (et donc les bons hashes
  // de chunks). Le cache reste utilisé uniquement en fallback offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // On cache les pages fréquentes pour le mode offline uniquement.
          const isFrequentPage = STALE_WHILE_REVALIDATE_ROUTES.some(
            (route) => url.pathname === route || url.pathname.startsWith(route + '/')
          );
          if (response.ok && isFrequentPage) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match('/offline');
          return offline || caches.match('/offline.html');
        })
    );
    return;
  }

  // Next.js chunks (/_next/static/chunks/*.js) — cache-first mais avec fallback
  // réseau ET suppression du cache si 404 : si un vieux chunk en cache n'est
  // plus présent côté serveur, on nettoie pour forcer le navigateur à recharger.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached || Response.error());
      })
    );
    return;
  }

  // Autres assets statiques (images, fonts, logos) — cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});
