import type { NextConfig } from "next";

const config: NextConfig = {
  // This app runs ONLY on the operator's own machine. It shells out to git and
  // pnpm, so it must never be deployed to a public host -- that would be remote
  // code execution as a service. Locality is enforced below by pinning the
  // allowed Server Action origins to localhost, NOT by the build output mode.
  //
  // Do not set `output: "standalone"` here: the launcher serves the app with
  // `next start`, which Next does not support for a standalone build (it warns
  // and does not serve static assets from the standalone tree). The two must
  // agree, and `next start` is the simpler, dependency-present path on the
  // operator's own machine.
  experimental: {
    // Server Actions call child_process. Keep the surface local.
    serverActions: { allowedOrigins: ["localhost:4000", "127.0.0.1:4000"] },
  },
};

export default config;
