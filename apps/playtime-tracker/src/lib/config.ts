/**
 * Build and deployment facts, stated once.
 *
 * Every value here is either real or explicitly absent. Nothing in this file
 * invents a version number, a support address or a policy URL that does not
 * exist -- a store reviewer following a dead "Privacy Policy" link is a
 * rejection, and a user following one is worse.
 */

const env = (key: string): string | undefined => {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
};

/** Marketing version, e.g. "1.0.0". Set at build time. */
export const APP_VERSION = env("NEXT_PUBLIC_APP_VERSION") ?? "0.1.0";

/**
 * Build number. Apple and Google both require this to increase with every
 * upload. It is injected by the release build; "dev" locally, never faked.
 */
export const BUILD_NUMBER = env("NEXT_PUBLIC_BUILD_NUMBER") ?? "dev";

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
export const SUPPORT_EMAIL = env("NEXT_PUBLIC_SUPPORT_EMAIL") ?? null;

export const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL") ?? null;
export const SUPABASE_KEY = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? null;

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
