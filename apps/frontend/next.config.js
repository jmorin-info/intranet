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
      { key: "X-Frame-Options", value: "DENY" },
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
    ];
  },
};

module.exports = nextConfig;
