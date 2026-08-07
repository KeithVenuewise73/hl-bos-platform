import type { NextConfig } from "next";

// HSCS marketing website — public, unauthenticated. It has NO command-execution
// surface, no backend, and no authenticated area (Milestone 2A is the homepage
// plus honest "being prepared" pages). Security headers are global; production
// source maps are disabled.
//
// Content-Security-Policy is intentionally NOT set here. It is emitted per
// request (with a fresh nonce) from middleware.ts, which is the single
// authoritative CSP source — a static header cannot carry the nonce Next.js
// needs to hydrate the responsive navigation under a strict policy. This mirrors
// the established pattern in the Herman Legacy Digital app.
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
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
        ],
      },
    ]);
  },
};

export default config;
