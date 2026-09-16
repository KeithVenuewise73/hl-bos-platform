#!/usr/bin/env node
/**
 * Paint the native projects with this app's own identity.
 *
 * `npx cap add` scaffolds the iOS and Android projects with Capacitor's
 * default launcher icon and splash screen. Shipping those to a store would be
 * shipping somebody else's logo as ours -- and it is exactly the sort of thing
 * that survives all the way to a review rejection because nobody looked at the
 * home screen.
 *
 * Everything below is rendered by the same function that draws the web icon,
 * so the app looks like itself everywhere.
 *
 *   node scripts/make-native-assets.mjs
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { draw, splash } from "./icon.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANDROID = path.join(APP, "android/app/src/main/res");
const IOS = path.join(APP, "ios/App/App/Assets.xcassets");

const written = [];
const write = (file, buf) => {
  writeFileSync(file, buf);
  written.push(path.relative(APP, file));
};

// --- Android ---------------------------------------------------------------

if (existsSync(ANDROID)) {
  const DPI = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [dpi, size] of Object.entries(DPI)) {
    const dir = path.join(ANDROID, `mipmap-${dpi}`);
    write(path.join(dir, "ic_launcher.png"), draw(size));
    write(path.join(dir, "ic_launcher_round.png"), draw(size));
    // The adaptive foreground is 108dp where only the centre 72dp is
    // guaranteed visible, so the mark is drawn into that safe zone and the
    // tile colour comes from the background layer.
    write(path.join(dir, "ic_launcher_foreground.png"), draw(Math.round(size * 2.25), {
      maskable: true,
      transparent: true,
    }));
  }

  // The adaptive background must be the app's navy, not the template's white.
  writeFileSync(
    path.join(ANDROID, "values/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#142D4F</color>\n</resources>\n`,
  );
  written.push("android/app/src/main/res/values/ic_launcher_background.xml");

  // The template also ships a vector foreground that takes precedence on
  // API 24+. Point it at the generated mipmap instead of leaving Capacitor's
  // logo to win.
  const v24 = path.join(ANDROID, "drawable-v24/ic_launcher_foreground.xml");
  if (existsSync(v24)) {
    writeFileSync(
      v24,
      `<?xml version="1.0" encoding="utf-8"?>\n<!-- Replaced by scripts/make-native-assets.mjs: the template's vector\n     drew Capacitor's logo, which must never reach a store build. -->\n<bitmap xmlns:android="http://schemas.android.com/apk/res/android"\n    android:src="@mipmap/ic_launcher_foreground" />\n`,
    );
    written.push("android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml");
  }

  const SPLASH = {
    "drawable": [480, 320],
    "drawable-port-mdpi": [320, 480],
    "drawable-port-hdpi": [480, 800],
    "drawable-port-xhdpi": [720, 1280],
    "drawable-port-xxhdpi": [960, 1600],
    "drawable-port-xxxhdpi": [1280, 1920],
    "drawable-land-mdpi": [480, 320],
    "drawable-land-hdpi": [800, 480],
    "drawable-land-xhdpi": [1280, 720],
    "drawable-land-xxhdpi": [1600, 960],
    "drawable-land-xxxhdpi": [1920, 1280],
  };
  for (const [dir, [w, h]] of Object.entries(SPLASH)) {
    const file = path.join(ANDROID, dir, "splash.png");
    if (existsSync(path.dirname(file))) write(file, splash(w, h));
  }
}

// --- iOS -------------------------------------------------------------------

if (existsSync(IOS)) {
  // App Store Connect rejects an icon with an alpha channel, so this one is
  // drawn square and fully opaque.
  write(path.join(IOS, "AppIcon.appiconset/AppIcon-512@2x.png"), draw(1024, { maskable: true }));
  for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    const file = path.join(IOS, "Splash.imageset", name);
    if (existsSync(path.dirname(file))) write(file, splash(2732, 2732));
  }
}

if (written.length === 0) {
  console.log("No native project found. Run `npx cap add ios` / `npx cap add android` first.");
} else {
  console.log(`wrote ${written.length} native assets`);
  for (const f of written) console.log(`  ${f}`);
}
