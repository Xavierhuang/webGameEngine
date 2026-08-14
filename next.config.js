/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Both gates are ON. They were both disabled with no CI, which is how a real
  // type error and a set of react-hooks/rules-of-hooks violations (hooks called
  // conditionally in SceneView) sat undetected. The tree is now at zero type
  // errors and zero lint errors, and CI enforces both on every push.
  eslint: { ignoreDuringBuilds: false },
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

