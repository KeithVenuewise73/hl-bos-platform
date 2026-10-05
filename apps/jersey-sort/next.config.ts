import type { NextConfig } from "next";

// JerseySort AI.
//
// Photos of young athletes, so the posture is deliberate:
//
//   * Listens on 127.0.0.1 only (package.json). Accounts exist, but nobody
//     has decided to put this on a network yet, so it is not on one.
//   * Every photo is served through an authenticated route that checks the
//     viewer's organization. There is no public URL to any image.
//   * frame-ancestors 'none', connect-src 'self': the browser never talks to
//     an AI service; every outbound call happens on the server, key there.
//   * Image tooling (sharp, tesseract, libheif) is native or wasm and is kept
//     out of the bundler.
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/jersey-sort"],
  serverExternalPackages: [
    "sharp",
    "tesseract.js",
    "@tesseract.js-data/eng",
    "exifr",
    "heic-convert",
  ],
  experimental: {
    // Bulk actions post up to a full page of photo ids.
    serverActions: { bodySizeLimit: "2mb" },
  },
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
