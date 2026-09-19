import type { NextConfig } from "next";

// HighlightAI Football. This app holds video of minors, so the security posture
// is not boilerplate:
//
//   * A strict CSP with no inline scripts. `media-src 'self' blob:` is the one
//     widening, and it exists because the player streams clips the app itself
//     serves.
//   * frame-ancestors 'none': a highlight reel of somebody's child must not be
//     embeddable in a page we did not write.
//   * No production source maps, no powered-by header.
//
// GPU work does not happen here. This app renders decisions made by
// @hl-bos/highlight-football and orchestrates a separate worker; it never
// attempts video analysis inside a serverless function.
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/highlight-football"],
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
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob:; media-src 'self' blob:; " +
              "connect-src 'self' https://*.supabase.co; " +
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]);
  },
};

export default config;
