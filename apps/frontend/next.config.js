const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

// ─── Content-Security-Policy ───────────────────────────────────────────────
// Strict CSP applied on every route. Dev mode keeps 'unsafe-inline' /
// 'unsafe-eval' for Next.js hot-reload & React refresh; production is strict.
// A nonce-based script-src would be ideal but requires a middleware which is
// out of scope for v1 (the Next 15 App Router still injects a few inline
// bootstrap scripts without nonce support on static pages). Revisit once
// the framework-level nonce plumbing stabilises.
//
// Trusted external origins:
//   - OnlyOffice document server (env NEXT_PUBLIC_ONLYOFFICE_URL)
//   - DocuSeal signature iframe + API (docuseal.com + NEXT_PUBLIC_DOCUSEAL_URL)
//   - Sentry ingest (*.sentry.io) — telemetry is opt-in via DSN
// `frame-ancestors 'self'` matches X-Frame-Options: SAMEORIGIN (used by the
// Glance same-origin overlay); object-src is disabled entirely.
const isProd = process.env.NODE_ENV === "production";

const onlyofficeUrl = (process.env.NEXT_PUBLIC_ONLYOFFICE_URL || "").trim();
const docusealUrl = (process.env.NEXT_PUBLIC_DOCUSEAL_URL || "").trim();

const extraFrameSrc = [onlyofficeUrl, docusealUrl, "https://docuseal.com", "https://*.docuseal.com"]
  .filter(Boolean)
  .join(" ");
const extraConnectSrc = [onlyofficeUrl, docusealUrl, "https://docuseal.com", "https://*.docuseal.com"]
  .filter(Boolean)
  .join(" ");

const scriptSrc = isProd
  ? "script-src 'self'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const cspDirectives = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'", // Tailwind JIT + Next inline styles
  "img-src 'self' data: blob: https:", // avatars LDAP, tuiles cartes, etc.
  "font-src 'self' data:",
  `connect-src 'self' https://*.sentry.io ${extraConnectSrc}`.trim(),
  `frame-src 'self' ${extraFrameSrc}`.trim(),
  "frame-ancestors 'self'", // cohérent avec X-Frame-Options SAMEORIGIN (Glance overlay)
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
];

const cspHeader = cspDirectives.join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@omnitech/shared", "@omnitech/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
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
      { key: "Content-Security-Policy", value: cspHeader },
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
    ];
  },
};

// Sentry — opt-in. We always wrap the config (the Next.js plugin is a no-op
// for runtime behaviour when no DSN is provided), but source-map upload
// only happens when SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set.
let exported = withBundleAnalyzer(nextConfig);
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
