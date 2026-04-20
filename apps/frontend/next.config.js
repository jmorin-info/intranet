/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@omnitech/shared', '@omnitech/ui'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  async redirects() {
    return [
      // Anciennes URLs avec slash → nouvelles URLs avec tiret
      { source: '/admin/ldap/pending', destination: '/admin/ldap-pending', permanent: true },
      { source: '/admin/ldap', destination: '/admin/ldap-pending', permanent: false },
      { source: '/approval-workflows/pending', destination: '/documents/pending', permanent: true },
      { source: '/news/new', destination: '/news/compose', permanent: true },
      // Consolidated tab redirects (previously page.tsx wrappers)
      { source: '/admin/compliance-tasks', destination: '/admin/compliance?tab=planning', permanent: true },
      { source: '/admin/iso-controls', destination: '/admin/compliance?tab=controls', permanent: true },
      { source: '/admin/frameworks', destination: '/admin/compliance?tab=frameworks', permanent: true },
      { source: '/selfservice', destination: '/helpdesk?tab=selfservice', permanent: true },
    ];
  },
};

module.exports = nextConfig;
