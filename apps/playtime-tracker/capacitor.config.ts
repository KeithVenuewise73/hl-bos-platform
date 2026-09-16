import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shells.
 *
 * Capacitor wraps the static export in `out/` as a real iOS and Android
 * application. It adds no runtime JavaScript to the web build -- the shipped
 * app is the same files either way, which is what makes the browser-based
 * acceptance run in `qa/` evidence about the product rather than about a
 * preview of it.
 *
 * NO PLUGINS ARE INSTALLED, and that is a decision rather than an omission.
 * Every Capacitor plugin brings a native permission or capability with it, and
 * each one is something a store reviewer will ask about and a user will be
 * prompted for. This app needs none: it has no camera, no location, no
 * contacts, no notifications, no background execution. Sharing uses the Web
 * Share API, which the system share sheet already serves without a plugin or a
 * permission.
 */
const config: CapacitorConfig = {
  appId: "com.hermanlegacy.playtimetracker",
  appName: "PlayTime Tracker",
  webDir: "out",
  // The shell serves the bundled files from a local origin. No remote server
  // URL is configured: an app that loads its own code over the network would
  // stop working at the field, and both stores treat it as a red flag.
  server: {
    androidScheme: "https",
  },
  ios: {
    // The app draws its own background; matching it here stops a white flash
    // behind the safe areas on launch.
    backgroundColor: "#f4f6f8",
    contentInset: "always",
  },
  android: {
    backgroundColor: "#f4f6f8",
  },
};

export default config;
