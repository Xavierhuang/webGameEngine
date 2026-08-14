/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint stays off at build time: 29 pre-existing errors remain, including
  // react-hooks/rules-of-hooks violations in SceneView.tsx that need a real
  // refactor. CI reports the count (non-blocking) so it can be driven down;
  // flip this once it reaches zero. The TypeScript gate IS on — the tree is at
  // zero type errors and CI enforces it.
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

