import type { NextConfig } from "next";

// The cockpit is a client-only, statically-exported SPA — the same deployment
// shape as apps/hl-bti, and for the same reason: it holds no server-side
// secrets and has no server-side work to do. Every read and write is a
// permission-checked RPC in `public`, called from the browser with the
// publishable (anon) key plus the signed-in operator's JWT. Row Level Security
// and those RPCs are the security boundary; the key is not. No service-role key
// ever reaches the browser, and there is no route handler here that could
// hold one.
//
// This app is INTERNAL. It is not the customer-facing site (that is
// apps/herman-legacy-digital) and it is not the CEO console (that is
// apps/control-center, which stays localhost-only).
const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default config;
