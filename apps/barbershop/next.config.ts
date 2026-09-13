import type { NextConfig } from "next";

// BarberOS — the shop's own application.
//
// Unlike apps/control-center (localhost-only, drives git and pnpm), this app
// has NO command-execution surface: no child_process, no git, no filesystem
// mutation. Every write it performs goes to HL-BOS Core through the
// `public.barberos_*` API as the signed-in user, so the database's own
// permission checks decide what happens. It is safe to deploy publicly behind
// authentication.
//
// The Content-Security-Policy is NOT here. It needs a fresh nonce on every
// request so Next's inline hydration scripts are allowed, and a static header
// cannot do that -- see src/middleware.ts, which is also where the first
// deployment's dead sign-in button came from. The headers below are the ones
// that are genuinely the same for every response.
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
