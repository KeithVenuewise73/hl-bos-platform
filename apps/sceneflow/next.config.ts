import type { NextConfig } from "next";

/**
 * SceneFlow.
 *
 * This app exists separately from the Development Control Center for one
 * reason. The console can run git, pnpm, node and PowerShell on the machine it
 * is running on, so anything that can reach the console can run those — which
 * is why it may only ever listen on localhost. SceneFlow is meant to be opened
 * from a phone, so it carries none of that: its whole command surface is the
 * local image worker, behind a fixed argument array (see src/lib/shell.ts).
 *
 * Reaching it from the network is still opt-in, and still behind an access
 * code — see src/lib/access.ts. `start` binds to 127.0.0.1; only
 * `start:network` binds wider, and the launcher that calls it writes a code
 * first.
 *
 * That loopback bind is an explicit --hostname flag, NOT a default. `next
 * start` binds every interface unless told otherwise, so the first version of
 * this claim was simply false: both scripts were on the network. It was found
 * in a screenshot of the CEO's own machine, where the console — which runs git
 * and PowerShell — was advertising itself on his Tailscale address. There is
 * now a test in packages/catalog that fails if any app drops the flag.
 */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // The engine ships TypeScript source rather than a build artefact, so Next
  // compiles it itself.
  transpilePackages: ["@hl-bos/sceneflow"],
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // A photograph's URL must not travel to anywhere else.
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              // 'unsafe-inline' for styles only: every style in this app is a
              // React style attribute. Scripts need it for Next's own inline
              // bootstrap. Nothing external is loaded, and connect-src 'self'
              // means a page cannot post a photograph anywhere.
              "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
              "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
              "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; " +
              "form-action 'self'",
          },
        ],
      },
    ]);
  },
};

export default config;
