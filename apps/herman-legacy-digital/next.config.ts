import type { NextConfig } from "next";

// Herman Legacy Digital — the customer-facing operating company (public site +
// authenticated client portal). Assembled on HL-BOS; it has NO command-execution
// surface. The public site is unauthenticated; /portal is auth-gated in
// middleware. Security headers are global; production source maps are disabled.
//
// The one Server Action / route with a side effect is the assessment/consultation
// intake (POST /api/intake), a lead-capture endpoint — it writes only via the
// existing platform path and never returns fabricated results.
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/catalog", "@hl-bos/transformation-intelligence"],
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
          // Content-Security-Policy is intentionally NOT set here. It is emitted
          // per-request (with a fresh nonce) from middleware.ts, which is the
          // single authoritative CSP source — a static header cannot carry the
          // nonce Next.js needs to hydrate under a strict policy.
        ],
      },
    ]);
  },
};

export default config;
