import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { showToast } from '@/lib/toast-utils';
import {
  cacheData,
  getCached,
  resolveStore,
  buildCacheKey,
  setServingFromCache,
} from '@/lib/offline-cache';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, '/api/v1')
  : 'http://localhost:3000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  withCredentials: true, // Send httpOnly cookies (refresh token) with every request
});

// Set Content-Type to JSON by default, but let FormData override it automatically
// Also increase timeout for file uploads (FormData = likely upload)
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    // Don't set Content-Type — let axios/browser set multipart/form-data with boundary
    delete config.headers['Content-Type'];
    // Extend timeout to 10 minutes for file uploads (supports 2 Go+)
    config.timeout = 600_000;
  } else if (!config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // The refresh token is sent automatically via httpOnly cookie
        const { data } = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );

        const { accessToken } = data;
        localStorage.setItem('accessToken', accessToken);

        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('accessToken');
        if (typeof window !== 'undefined') {
          window.location.href = '/login?reason=session_expired';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ── Politique MFA : interception des codes backend ──
    // Le backend renvoie 403 avec un code `MFA_SETUP_REQUIRED` ou
    // `MFA_REVALIDATION_REQUIRED` dans le body (cf. MfaRequiredGuard /
    // FreshMfaGuard). On redirige avant tout autre handler 403 pour ne pas
    // les "swallow" silencieusement.
    if (error.response?.status === 403 && typeof window !== 'undefined') {
      const body = error.response.data as { code?: string } | undefined;
      const code = body?.code;
      const currentPath = window.location.pathname + window.location.search;
      if (code === 'MFA_SETUP_REQUIRED' && !window.location.pathname.startsWith('/mfa')) {
        // L'utilisateur a la politique mfaRequired imposée mais n'a pas activé
        // son MFA. On force le passage par /mfa avant tout autre accès.
        localStorage.setItem('mfaSetupRequired', 'true');
        window.location.href = '/mfa';
        return Promise.reject(error);
      }
      if (
        code === 'MFA_REVALIDATION_REQUIRED' &&
        !window.location.pathname.startsWith('/mfa/revalidate')
      ) {
        // Endpoint sensible touché → on redirige vers /mfa/revalidate avec
        // un retour vers la page d'origine (preservée dans `next`).
        const next = encodeURIComponent(currentPath);
        window.location.href = `/mfa/revalidate?next=${next}`;
        return Promise.reject(error);
      }
    }

    // Silently swallow 403/429 on GET requests (data loading, not user actions)
    // 403: non-admin user hitting admin-only endpoint
    // 429: rate limit exceeded during page load
    if ((error.response?.status === 403 || error.response?.status === 429) && originalRequest.method === 'get') {
      return Promise.resolve({ data: null, status: error.response.status });
    }

    // ── Offline fallback: serve from IndexedDB when a GET has no response ──
    if (!error.response && originalRequest.method === 'get') {
      const url = originalRequest.url || '';
      const store = resolveStore(url);
      if (store) {
        const key = buildCacheKey(url, originalRequest.params as Record<string, unknown> | undefined);
        const cached = await getCached(store, key);
        if (cached !== null) {
          setServingFromCache(true);
          return { data: cached, status: 200, statusText: 'OK (offline cache)', headers: {}, config: originalRequest };
        }
      }
    }

    // Network errors (no response) or server errors (5xx) — show a toast
    if (!error.response) {
      showToast('error', 'api.networkError', 'Erreur réseau — vérifiez votre connexion internet.');
    } else if (error.response.status >= 500) {
      showToast('error', 'api.serverError', 'Erreur serveur — veuillez réessayer dans quelques instants.');
    }

    return Promise.reject(error);
  },
);

// ── Cache-write interceptor: store successful GET responses in IndexedDB ──
api.interceptors.response.use(
  (response) => {
    if (
      typeof window !== 'undefined' &&
      response.config.method === 'get' &&
      response.status >= 200 &&
      response.status < 300 &&
      response.data != null
    ) {
      const url = response.config.url || '';
      const store = resolveStore(url);
      if (store) {
        const key = buildCacheKey(url, response.config.params as Record<string, unknown> | undefined);
        // Fire-and-forget — don't block the response
        cacheData(store, key, response.data).catch(() => {});
        // If we were serving from cache before, we're back online now
        setServingFromCache(false);
      }
    }
    return response;
  },
  (error) => Promise.reject(error),
);
