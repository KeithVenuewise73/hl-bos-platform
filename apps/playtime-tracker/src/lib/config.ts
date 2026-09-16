/**
 * Build and deployment facts, stated once.
 *
 * Every value here is either real or explicitly absent. Nothing in this file
 * invents a version number, a support address or a policy URL that does not
 * exist -- a store reviewer following a dead "Privacy Policy" link is a
 * rejection, and a user following one is worse.
 */

import {
  APP_VERSION as RELEASE_VERSION,
  BUILD_NUMBER as RELEASE_BUILD,
} from "./release";

/*
 * LITERAL dot-access, deliberately, on every NEXT_PUBLIC_ value below.
 *
 * A Next.js static export inlines `process.env.NEXT_PUBLIC_X` at build time by
 * textual substitution. Reading the same value through a helper --
 * `env("NEXT_PUBLIC_X")`, or any bracket access with a variable key -- is NOT
 * substituted, so it is undefined in the browser and the app silently decides
 * it has no backend. This file was written the wrong way first and the lint
 * rule caught it; the shape is spelled out here so it does not get "tidied"
 * back.
 *
 * Both Supabase values are browser-safe by the platform's own ENV_SPEC: the
 * URL is in every request, and the publishable key is documented as public
 * because Row Level Security -- not secrecy -- is the boundary. The
 * service-role key is never referenced anywhere in this app.
 */
const raw = {
  version: process.env.NEXT_PUBLIC_APP_VERSION,
  build: process.env.NEXT_PUBLIC_BUILD_NUMBER,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
};

/** Treat an empty string as absent: an unset variable often arrives as "". */
const set = (value: string | undefined): string | undefined =>
  value !== undefined && value.length > 0 ? value : undefined;

/**
 * Marketing version and build number, from store/release.json via
 * scripts/set-release.mjs. The same two values are written into the Gradle
 * config and the Xcode project by that script, so the number a user reads on
 * the Account screen is the number of the build they are running.
 *
 * An environment variable can override them for a one-off build; nothing here
 * is ever invented.
 */
export const APP_VERSION = set(raw.version) ?? RELEASE_VERSION;
export const BUILD_NUMBER = set(raw.build) ?? RELEASE_BUILD;

export const APP_NAME = "PlayTime Tracker";

/**
 * Where the store listings point. These are structural: the app renders its
 * own policy and terms pages, so the links always resolve even before a public
 * marketing site exists.
 */
export const LINKS = {
  privacy: "/legal/privacy/",
  terms: "/legal/terms/",
  support: "/support/",
} as const;

/** Support contact. Absent rather than invented if the build did not set one. */
export const SUPPORT_EMAIL = set(raw.supportEmail) ?? null;

export const SUPABASE_URL = set(raw.supabaseUrl) ?? null;
export const SUPABASE_KEY = set(raw.supabaseKey) ?? null;

/**
 * Whether this build has an account service behind it at all.
 *
 * When false the app still works completely -- teams, rosters, live tracking,
 * reports and history all run on the device. What it does NOT do is claim to
 * have an account, sync anything, or show a sign-in form that cannot sign
 * anyone in. The Account screen says which mode this build is in, in as many
 * words.
 */
export function accountsConfigured(): boolean {
  return SUPABASE_URL !== null && SUPABASE_KEY !== null;
}
