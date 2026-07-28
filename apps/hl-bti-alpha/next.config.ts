import type { NextConfig } from "next";

// HL-BTI Alpha is a client-only, statically-exported SPA. It has no server tier
// and talks to no live database: it runs entirely in the operator's browser and
// persists an "Alpha local workspace" to localStorage. Deploying it exposes only
// static files. It reuses the @hl-bos/bti-engine source directly.
const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  transpilePackages: ["@hl-bos/bti-engine"],
  images: { unoptimized: true },
};

export default config;
