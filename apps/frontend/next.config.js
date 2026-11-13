const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

// next-intl — pointe vers la config server (i18n/request.ts) qui charge les
// messages par locale. URLs sans préfixe locale (cf. i18n/config.ts).
const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// CSP est désormais émis par le middleware (src/middleware.ts) avec un nonce
// par requête + 'strict-dynamic'. On garde ici uniquement les autres entêtes
// de sécurité (statiques) — sinon ils écraseraient le CSP nonce-based.

// Item 32 — CDN pour assets statiques (Bunny.net recommandé / Cloudflare alt.).
// Si NEXT_PUBLIC_CDN_URL est défini, Next.js préfixera tous les assets
// statiques (`_next/static/*`) avec cette URL. Vide en dev → assets servis
// par le frontend Next.js comme avant (rétrocompatible).
// cf. docs/infrastructure/CDN_SETUP.md
const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || "";
// Hostname extrait pour `images.remotePatterns` (sans schéma ni path).
let cdnHostname = "";
if (cdnUrl) {
  try {
    cdnHostname = new URL(cdnUrl).hostname;
  } catch {
    // URL malformée — on ignore silencieusement, l'asset prefix tombera en
    // chaîne vide et le build ne plantera pas.
    cdnHostname = "";
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Visual QA owns its dev cache; it must never replace a release build.
  ...(process.env.OMNITECH_UI_QA === "1" ? {
    distDir: ".next-ui-qa",
    devIndicators: false,
    async rewrites() { return [{ source: "/api/:path*", destination: "http://127.0.0.1:17692/api/:path*" }]; },
  } : {}),
  transpilePackages: ["@omnitech/shared", "@omnitech/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Item 32 — Préfixe CDN pour `_next/static/*`, `/static/*`, fonts, JS chunks.
  // Cf. https://nextjs.org/docs/app/api-reference/next-config-js/assetPrefix
  // Le cache busting reste géré par Next.js (hash dans le filename), donc
  // on peut servir avec Cache-Control immutable côté CDN sans risque de stale.
  ...(cdnUrl ? { assetPrefix: cdnUrl } : {}),
  images: {
    // Restreint à l'origine prod + dev local (sécurité + perf : '**' était
    // trop permissif — exposait le loader d'images Next à n'importe quel
    // hôte HTTPS, augmentant la surface SSRF + le risque DoS via le proxy
    // d'images Next). Les avatars LDAP sont servis localement (/storage/avatars/),
    // donc pas besoin d'autoriser un host externe pour eux.
    // Les images externes des news utilisent déjà `unoptimized` côté composant,
    // donc elles ne traversent pas ce loader.
    remotePatterns: [
      { protocol: "https", hostname: "intranet.omnitech-security.fr" },
      { protocol: "https", hostname: "vaultwarden.omnitech-security.fr" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
      // CDN host (Bunny / Cloudflare) — ajouté dynamiquement pour autoriser
      // <Image src="https://cdn.intranet…/foo.jpg" /> via le loader Next.
      ...(cdnHostname
        ? [{ protocol: "https", hostname: cdnHostname }]
        : []),
    ],
    // Item 32 — Loader d'image custom qui exploite la "Bunny Image
    // Optimization" (query params `?width=&format=webp&quality=`) pour
    // éviter de payer le serveur Next pour la transformation, OU se rabat
    // sur le loader Next par défaut quand le CDN n'est pas configuré.
    // Cf. https://docs.bunny.net/docs/stream-image-optimizer
    ...(cdnUrl
      ? {
          loader: "custom",
          loaderFile: "./src/lib/cdn-image-loader.ts",
        }
      : {}),
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  async headers() {
    const securityHeaders = [
      // SAMEORIGIN (au lieu de DENY) pour permettre la feature "Glance" —
      // aperçu rapide same-origin via iframe (voir components/layout/glance-overlay.tsx).
      // Toujours protégé contre le clickjacking d'origines tierces.
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      { key: "X-XSS-Protection", value: "0" },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // Anciennes URLs avec slash → nouvelles URLs avec tiret
      {
        source: "/admin/ldap/pending",
        destination: "/admin/ldap-pending",
        permanent: true,
      },
      {
        source: "/admin/ldap",
        destination: "/admin/ldap-pending",
        permanent: false,
      },
      {
        source: "/approval-workflows/pending",
        destination: "/documents/pending",
        permanent: true,
      },
      { source: "/news/new", destination: "/news/compose", permanent: true },
      // Consolidated tab redirects (previously page.tsx wrappers)
      {
        source: "/admin/compliance-tasks",
        destination: "/admin/compliance?tab=planning",
        permanent: true,
      },
      {
        source: "/admin/iso-controls",
        destination: "/admin/compliance?tab=controls",
        permanent: true,
      },
      {
        source: "/admin/frameworks",
        destination: "/admin/compliance?tab=frameworks",
        permanent: true,
      },
      {
        source: "/selfservice",
        destination: "/helpdesk?tab=selfservice",
        permanent: true,
      },
      // Fusion audit-log + audit-timeline → /admin/audit (onglets)
      {
        source: "/admin/audit-log",
        destination: "/admin/audit?tab=log",
        permanent: true,
      },
      {
        source: "/admin/audit-timeline",
        destination: "/admin/audit?tab=timeline",
        permanent: true,
      },
      // Fusion /admin/spaces → /admin/access (onglet Utilisateurs)
      // cf. docs/architecture/ACCESS_AND_SPACES_UNIFICATION.md (Option B)
      {
        source: "/admin/spaces",
        destination: "/admin/access?tab=users",
        permanent: false,
      },
      // Fusion search v1 (Postgres) + search/v2 (Meili) → /search unifie
      // cf. docs/search/UNIFIED_SEARCH.md (vague A post-launch v1.1)
      {
        source: "/search/v2",
        destination: "/search",
        permanent: true,
      },
    ];
  },
};

// Sentry — opt-in. We always wrap the config (the Next.js plugin is a no-op
// for runtime behaviour when no DSN is provided), but source-map upload
// only happens when SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set.
let exported = withBundleAnalyzer(withNextIntl(nextConfig));
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require("@sentry/nextjs");
  exported = withSentryConfig(exported, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    // Only upload source maps when explicitly configured.
    disableLogger: true,
    automaticVercelMonitors: false,
    widenClientFileUpload: false,
    hideSourceMaps: true,
    tunnelRoute: undefined,
  });
} catch {
  // @sentry/nextjs not installed — keep base config (telemetry disabled).
}

module.exports = exported;
