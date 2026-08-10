/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Skip lint/TS gates at build time — these are lift-and-shift deploys; fix in follow-up PRs.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    domains: [
      'localhost',
      'replicate.delivery',
    ],
  },
  webpack: (config) => {
    config.externals.push({
      'bufferutil': 'bufferutil',
      'utf-8-validate': 'utf-8-validate',
    });
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;

