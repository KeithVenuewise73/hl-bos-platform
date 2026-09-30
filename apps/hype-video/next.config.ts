import type { NextConfig } from "next";

// 5-Star Hype Video.
//
// This app holds photographs and video of young athletes, so the posture is
// not boilerplate:
//
//   * It listens on 127.0.0.1 only (see package.json). There are no accounts
//     yet, so the only safe audience is the person at this computer.
//   * frame-ancestors 'none': a child's hype video must not be embeddable in a
//     page we did not write.
//   * connect-src 'self': the browser never talks to an AI or media service
//     directly. Every outbound call happens on the server, with the key there.
//   * No production source maps, no powered-by header.
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/hype-video"],
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
              "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; " +
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]);
  },
};

export default config;
