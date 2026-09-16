import type { NextConfig } from "next";

/**
 * PlayTime Tracker.
 *
 * STATICALLY EXPORTED, deliberately. `output: "export"` produces a folder of
 * HTML, JS and CSS with no server behind it, which is what an iOS or Android
 * app bundle actually is -- the same build is what Capacitor wraps for the App
 * Store and Play Store. It also means the app keeps working when there is no
 * network at all, which on a sports field is most of the time.
 *
 * The consequence is that there is no server session and no server-side data
 * access. Every read and write goes straight from the device to Supabase with
 * the publishable key, and ROW LEVEL SECURITY is the only thing standing
 * between one coach's roster and another's. That is not a shortcut: it is the
 * same boundary a native app would rely on, and it is why migration 0049
 * enables AND forces RLS on every table and grants no service-role path.
 *
 * There is therefore no route here that can hold a secret, and no secret is
 * given to one.
 */
const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@hl-bos/playtime-engine"],
  images: { unoptimized: true },
  // Trailing slashes keep deep links working when the export is served from a
  // file:// origin inside a native shell, where "/game" resolves to a
  // directory rather than a document.
  trailingSlash: true,
};

export default config;
