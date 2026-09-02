const isDev = process.env.NODE_ENV !== 'production';

/*
 * Security headers. There were none anywhere — no CSP, no HSTS, no
 * frame-ancestors — on a product for children with a WebGL canvas that loads
 * models from user projects.
 *
 * The CSP is deliberately strict about *scripts* (self only, plus the inline
 * bootstraps Next emits) and permissive about *assets*: images, audio and
 * fetches may come from any https origin because a child's project can
 * reference an uploaded or AI-generated model on another host. That keeps the
 * XSS defence while not breaking a single existing game. `unsafe-eval` is
 * dev-only (React Refresh needs it); `blob:`/`data:` cover three.js loaders
 * and the paint editor's canvases. Tighten `connect-src` to a list of known
 * hosts once assets move to a single bucket.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https: blob: data:${isDev ? ' ws: wss:' : ''}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=()' },
  // The droplet terminates TLS in front of Next; HSTS is harmless over http
  // (browsers ignore it) and required over https.
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
];

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
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Models and backdrops are content-addressed by the generators and
      // never change in place; without this a child re-validated sixty GLBs
      // on every editor open.
      { source: '/models/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/backdrops/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};

module.exports = nextConfig;

