import type { NextConfig } from "next";

const config: NextConfig = {
  // This app runs ONLY on the operator's own machine. It shells out to git and
  // pnpm, so it must never be deployed to a public host -- that would be remote
  // code execution as a service.
  output: "standalone",
  // Workspace packages ship TypeScript source rather than a build artefact, so
  // Next compiles them itself. video-studio runs in the browser bundle.
  transpilePackages: ["@hl-bos/video-studio"],
  experimental: {
    // Server Actions call child_process. Keep the surface local.
    serverActions: { allowedOrigins: ["localhost:4000", "127.0.0.1:4000"] },
  },
};

export default config;
