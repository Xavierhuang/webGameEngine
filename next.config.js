/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The type gate is ON. It was disabled with no CI, which is how a real type
  // error sat undetected.
  //
  // There is deliberately no `eslint` key here: Next 16 removed `next lint`
  // and the lint-on-build integration with it, so `ignoreDuringBuilds: false`
  // was reassurance that no longer did anything. Linting is enforced by
  // `npm run lint` in CI, and nowhere else — if that step is removed, the
  // rules stop being checked entirely.
  typescript: { ignoreBuildErrors: false },
  images: {
    // `domains` was removed in Next 16; remotePatterns is stricter about
    // protocol and path, which is the point of the change.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'replicate.delivery' },
    ],
  },
  // The webpack block that used to live here marked `bufferutil` and
  // `utf-8-validate` external. Those are optional native add-ons of `ws`;
  // Turbopack (the default bundler from Next 16) resolves optional
  // dependencies without help, so the config is gone rather than translated.
  turbopack: {},
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;

