import type { NextConfig } from "next";

// HL-BTI (production) is a client-only, statically-exported SPA — the same
// deployment shape as HL-BTI Alpha, but authenticated and persistent. It talks
// to the HL-BOS Supabase Pro project directly from the browser using ONLY the
// publishable (anon) key + the signed-in user's JWT; Row Level Security and the
// permission-checked public.bti_* RPCs are the security boundary. No service
// key ever reaches the browser. It reuses @hl-bos/bti-engine source directly.
//
// Static export means the whole app is a folder of files any static host (here,
// Coolify serving it behind nginx) can serve. The two NEXT_PUBLIC_SUPABASE_*
// values are inlined at BUILD time — they are public by design.
const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  transpilePackages: ["@hl-bos/bti-engine"],
  images: { unoptimized: true },
};

export default config;
