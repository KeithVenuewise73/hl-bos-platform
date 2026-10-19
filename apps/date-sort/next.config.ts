import type { NextConfig } from "next";

// DateSort.
//
//   * Listens on 127.0.0.1 only (package.json): it reads folders on this
//     computer, so nothing else on the network may ask it to.
//   * No account, no database, no outbound calls. connect-src 'self': the
//     page talks to this app and nothing else.
//   * The API routes refuse requests from any other web page (lib/guard.ts),
//     so a website open in another tab cannot make DateSort scan a folder or
//     open a folder window.
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/date-sort"],
  serverExternalPackages: ["exifr"],
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob:; connect-src 'self'; " +
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]);
  },
};

export default config;
