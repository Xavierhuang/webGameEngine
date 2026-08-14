/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint stays off at build time (not yet audited), but the TypeScript gate is
  // ON again: the tree is at zero errors and CI runs `type-check` on every
  // push. With both gates off and no CI, a real type error sat undetected.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
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

