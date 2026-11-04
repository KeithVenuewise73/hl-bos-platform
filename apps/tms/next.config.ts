import type { NextConfig } from "next";

// HLG TMS — Release 1 local prototype.
//
//   * Listens on 127.0.0.1 only (package.json). It talks to an ISOLATED local
//     PostgreSQL (src/lib/env.ts refuses any other host) and signs people in
//     against that database's auth.users. Production sign-in is HL-BOS
//     (Supabase) auth; see README.
//   * Every page and API route checks the module licence and the role on the
//     server (src/lib/guard.ts). Hidden navigation is a convenience only.
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/tms", "@hl-bos/commercial"],
  serverExternalPackages: ["pg"],
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
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'" +
              (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
              "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]);
  },
};

export default config;
