import type { NextConfig } from "next";

// Herman Legacy Executive Portal — a SECURE, READ-ONLY, cloud-deployable app.
//
// Unlike apps/control-center (localhost-only, drives git/pnpm), this app has NO
// command-execution surface: no child_process, no git, no pnpm, no filesystem
// mutation, no Server Actions that do anything but is read-only. It is safe to
// deploy publicly *behind authentication*.
//
// Security headers are set globally. Source maps are disabled in production so
// internal structure is not shipped to the browser. Server Actions are left
// unconfigured (the app defines none).
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: [
    "@hl-bos/catalog",
    "@hl-bos/bti-engine",
    "@hl-bos/transformation-intelligence",
  ],
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data:; connect-src 'self' https://*.supabase.co; " +
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]);
  },
};

export default config;
