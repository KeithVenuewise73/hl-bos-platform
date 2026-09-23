import type { NextConfig } from "next";

/**
 * DispatchOS Match.
 *
 * No server-side state, no command surface, no secrets: the matching engine is
 * pure TypeScript and runs in the browser over sample data plus any CSV the
 * dispatcher pastes in. Nothing is sent anywhere — connect-src 'self'.
 */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // The engine ships TypeScript source rather than a build artefact.
  transpilePackages: ["@hl-bos/dispatch-match"],
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
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]);
  },
};

export default config;
