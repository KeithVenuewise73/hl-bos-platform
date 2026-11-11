import type { NextConfig } from "next";

// Game Cut.
//
//   * Listens on 127.0.0.1 only (package.json): it reads video files on this
//     computer and opens file windows, so nothing else on the network may ask it to.
//   * No account, no database, no outbound network. The videos are never uploaded:
//     ffmpeg reads them where they are.
//   * The API routes refuse requests from any other web page (lib/guard.ts), so a
//     website open in another tab cannot make Game Cut read a file or open a window.
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/game-cut"],
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
              "img-src 'self' data:; connect-src 'self'; " +
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]);
  },
};

export default config;
