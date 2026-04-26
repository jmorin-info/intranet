import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = [
  "/login",
  "/logout",
  "/chartes",
  "/forgot-password",
  "/reset-password",
  "/welcome",
];

const isProd = process.env.NODE_ENV === "production";

const onlyofficeUrl = (process.env.NEXT_PUBLIC_ONLYOFFICE_URL || "").trim();
const docusealUrl = (process.env.NEXT_PUBLIC_DOCUSEAL_URL || "").trim();
const extraFrameSrc = [
  onlyofficeUrl,
  docusealUrl,
  "https://docuseal.com",
  "https://*.docuseal.com",
]
  .filter(Boolean)
  .join(" ");
const extraConnectSrc = [
  onlyofficeUrl,
  docusealUrl,
  "https://docuseal.com",
  "https://*.docuseal.com",
]
  .filter(Boolean)
  .join(" ");

function buildCsp(nonce: string): string {
  // Nonce-based CSP. Next.js injects inline streaming scripts (`__next_f.push`),
  // a dark-mode init, a service-worker unregister hook, and chunk-error recovery.
  // All of these need either 'unsafe-inline' or a per-request nonce.
  // We use the nonce + 'strict-dynamic' so any script that the nonce'd scripts
  // load transitively is also trusted (covers webpack chunk loading).
  // In dev, Next.js's React refresh requires 'unsafe-eval' too.
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.sentry.io https://api.open-meteo.com ${extraConnectSrc}`.trim(),
    `frame-src 'self' ${extraFrameSrc}`.trim(),
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Per-request nonce (16 random bytes → base64). Used for CSP on every HTML response.
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  // Forward the nonce to RSC via a request header so server components
  // (RootLayout) can read it via `headers()` and stamp it on inline scripts.
  // Next.js also reads this header to nonce its own injected streaming scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    // Prevent redirect loops: authenticated users hitting /login are sent to /dashboard.
    // On détecte la session via les cookies httpOnly (refreshToken OU
    // accessToken — ce dernier ajouté par la migration ANSSI A.5.34 / OWASP A05
    // qui sort le JWT de localStorage). Le refreshToken reste l'indicateur le
    // plus fiable (path=/api/v1/auth/refresh), mais accessToken (path=/api)
    // est aussi envoyé sur la nav vers /login uniquement si même origine —
    // ici Next.js et l'API ne partagent pas le path, donc en pratique seul
    // refreshToken sera envoyé sur /login. accessToken est gardé en filet
    // de sécurité pour les déploiements où Nginx route différemment.
    if (pathname.startsWith("/login")) {
      const hasSession =
        request.cookies.has("refreshToken") ||
        request.cookies.has("accessToken");
      if (hasSession) {
        const dashboardUrl = new URL("/dashboard", request.url);
        return NextResponse.redirect(dashboardUrl);
      }
    }
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", buildCsp(nonce));
    return res;
  }

  // Allow Next.js internals, static files, PWA files (no CSP rewrite needed —
  // those are not HTML responses).
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js"
  ) {
    return NextResponse.next();
  }

  // Server-side auth gate removed: the refreshToken cookie has path=/api/auth/refresh
  // so it is NOT sent on navigation requests to /dashboard etc. The client-side
  // AuthProvider (fetchMe + JWT validation) is the authoritative auth gate.
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", buildCsp(nonce));
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|pdf\\.worker|manifest\\.json|sw\\.js).*)",
  ],
};
