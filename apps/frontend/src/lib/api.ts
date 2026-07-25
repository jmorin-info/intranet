import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";
import { showToast } from "@/lib/toast-utils";
import {
  cacheData,
  getCached,
  resolveStore,
  buildCacheKey,
  setServingFromCache,
} from "@/lib/offline-cache";

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, "/api/v1")
  : "http://localhost:3000/api/v1";

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
    delete config.headers["Content-Type"];
    // Extend timeout to 10 minutes for file uploads (supports 2 Go+)
    config.timeout = 600_000;
  } else if (!config.headers["Content-Type"]) {
    config.headers["Content-Type"] = "application/json";
  }
  // Backups (export, full-network, download-project) prennent 1-3 minutes
  // côté serveur (pg_dump + tar). Le timeout par défaut de 15 s ferait
  // avorter la requête côté client alors que le job continuerait côté serveur,
  // sans feedback. On bascule à 10 minutes pour ces endpoints.
  const url = config.url || "";
  if (
    url.startsWith("/backup/export") ||
    url === "/backup/export-full-network" ||
    url === "/backup/download-project" ||
    url.startsWith("/backup/restore") ||
    url.startsWith("/backup/download/")
  ) {
    config.timeout = 600_000;
  }
  // RAG / IA : l'inférence LLM tourne en local (Ollama, CPU). Une réponse
  // complète dépasse fréquemment le timeout par défaut de 15 s, alors que le
  // backend accorde ~30 s au LLM. Sans cet alignement, le client avorte avant
  // la fin → le chatbot bascule à tort sur le fallback (ou échoue) et l'IA
  // « ne répond pas ». On laisse une marge au-dessus du budget backend.
  if (url.startsWith("/rag/ask") || url.startsWith("/ai/search")) {
    // Doit rester AU-DESSUS du budget backend (RAG_ANSWER_TIMEOUT_MS, défaut
    // code 180 s, non surchargé par le .env de prod) pour ne pas avorter une
    // génération qui aboutit côté serveur. On ne pose ce timeout QUE si
    // l'appelant n'en a pas fourni un explicite (sinon on écrasait le
    // { timeout: 200_000 } de handleAskAi → code mort).
    if (!config.timeout || config.timeout === api.defaults.timeout) {
      config.timeout = 200_000;
    }
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

// Le JWT est désormais transmis via cookie httpOnly `accessToken` (ANSSI A.5.34
// / OWASP A05) — il est attaché automatiquement par le navigateur grâce à
// `withCredentials: true` ci-dessus. Plus besoin d'un intercepteur Bearer
// manuel (qui exigeait d'exposer le token au JS, donc à toute XSS).
//
// Rétrocompat : si une session legacy a encore un token en localStorage et pas
// encore de cookie (1ʳᵉ requête après mise en prod), on le réinjecte une seule
// fois en header Authorization. Le backend `JwtStrategy` accepte les deux
// schémas. Au prochain refresh / login, le cookie sera posé et cette branche
// deviendra inactive.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const legacyToken = localStorage.getItem("accessToken");
    if (legacyToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${legacyToken}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          // Cookie has been rotated server-side — just retry, navigateur
          // attache le nouveau cookie automatiquement.
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Both tokens travel via httpOnly cookies. The backend rotates the
        // accessToken cookie on success — no need to read/write the body
        // token client-side. We still surface `accessToken` to processQueue
        // for legacy waiters that still want to set Authorization headers.
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });

        const { accessToken } = data;
        // Cleanup éventuel reliquat localStorage post-migration cookie.
        localStorage.removeItem("accessToken");

        processQueue(null, accessToken);

        // Pas de Authorization header à reposer : le cookie suffit.
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem("accessToken");
        if (typeof window !== "undefined") {
          window.location.href = "/login?reason=session_expired";
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
    if (error.response?.status === 403 && typeof window !== "undefined") {
      const body = error.response.data as { code?: string } | undefined;
      const code = body?.code;
      const currentPath = window.location.pathname + window.location.search;
      if (code === "MFA_SETUP_REQUIRED" && !window.location.pathname.startsWith("/mfa")) {
        // L'utilisateur a la politique mfaRequired imposée mais n'a pas activé
        // son MFA. On force le passage par /mfa avant tout autre accès.
        localStorage.setItem("mfaSetupRequired", "true");
        window.location.href = "/mfa";
        return Promise.reject(error);
      }
      if (
        code === "MFA_REVALIDATION_REQUIRED" &&
        !window.location.pathname.startsWith("/mfa/revalidate")
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
    if (
      (error.response?.status === 403 || error.response?.status === 429) &&
      originalRequest.method === "get"
    ) {
      return Promise.resolve({ data: null, status: error.response.status });
    }

    // ── Offline fallback: serve from IndexedDB when a GET has no response ──
    if (!error.response && originalRequest.method === "get") {
      const url = originalRequest.url || "";
      const store = resolveStore(url);
      if (store) {
        const key = buildCacheKey(
          url,
          originalRequest.params as Record<string, unknown> | undefined,
        );
        const cached = await getCached(store, key);
        if (cached !== null) {
          setServingFromCache(true);
          return {
            data: cached,
            status: 200,
            statusText: "OK (offline cache)",
            headers: {},
            config: originalRequest,
          };
        }
      }
    }

    // Network errors (no response) or server errors (5xx) — show a toast
    if (!error.response) {
      showToast("error", "api.networkError", "Erreur réseau — vérifiez votre connexion internet.");
    } else if (error.response.status >= 500) {
      showToast(
        "error",
        "api.serverError",
        "Erreur serveur — veuillez réessayer dans quelques instants.",
      );
    }

    return Promise.reject(error);
  },
);

// ── Cache-write interceptor: store successful GET responses in IndexedDB ──
api.interceptors.response.use(
  (response) => {
    if (
      typeof window !== "undefined" &&
      response.config.method === "get" &&
      response.status >= 200 &&
      response.status < 300 &&
      response.data != null
    ) {
      const url = response.config.url || "";
      const store = resolveStore(url);
      if (store) {
        const key = buildCacheKey(
          url,
          response.config.params as Record<string, unknown> | undefined,
        );
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
