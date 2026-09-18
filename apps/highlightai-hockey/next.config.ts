import type { NextConfig } from "next";

// HighlightAI Hockey.
//
// Single-tenant by construction in this phase: it stores one operator's career
// data in a local JSON store on the machine it runs on, and has no command
// surface, no shell access and no multi-user session model. The security
// headers below are still set, because "it is only local" is how local tools
// end up exposed.
//
// The Content-Security-Policy is deliberately tight: no external scripts, no
// external styles, no frames. Everything this app renders, it renders itself.
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/hockey-highlights"],
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
              "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; " +
              "base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]);
  },
};

export default config;
