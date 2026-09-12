import type { NextConfig } from "next";

// Football FilmStudy AI.
//
// Game film is proprietary and a large part of it is film of minors, so the
// security posture here is closer to apps/executive-portal than to a marketing
// site: no command-execution surface, no service-role key, strict headers, and
// no production source maps.
//
// media-src is present in the CSP because this app plays video from Supabase
// Storage signed URLs — the one thing the portal's policy does not need.
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/football"],
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
            // camera=(self) is deliberate: section 41's coach on the practice
            // field records film from the phone. microphone=(self) is for the
            // voice coaching note in section 42. Both are same-origin only.
            value: "camera=(self), microphone=(self), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob: https://*.supabase.co; " +
              "media-src 'self' blob: https://*.supabase.co; " +
              "connect-src 'self' https://*.supabase.co; " +
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]);
  },
};

export default config;
