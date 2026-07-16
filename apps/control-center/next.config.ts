import type { NextConfig } from "next";

const config: NextConfig = {
  // This app runs ONLY on the operator's own machine. It shells out to git and
  // pnpm, so it must never be deployed to a public host -- that would be remote
  // code execution as a service.
  output: "standalone",
  experimental: {
    // Server Actions call child_process. Keep the surface local.
    serverActions: { allowedOrigins: ["localhost:4000", "127.0.0.1:4000"] },
  },
};

export default config;
