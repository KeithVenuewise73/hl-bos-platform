import type { NextConfig } from "next";

// Herman Legacy Venture Studio (HLVS V2) — internal, authenticated executive app.
// Assembled on HL-BOS; no command-execution surface. /login + /api/health are the
// only public routes; everything else is auth-gated in middleware. Security
// headers are global; production source maps are disabled. The only write surface
// is the intake/decision route handlers, which call governed vstudio.* RPCs under
// the viewer's session (RLS-enforced) — never a service-role key.
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/catalog", "@hl-bos/venture-studio"],
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
