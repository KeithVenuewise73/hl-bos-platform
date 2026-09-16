/**
 * The environment variables this app reads — all of them, and nothing else.
 *
 * Declared rather than reached through `ProcessEnv`'s index signature for two
 * reasons. The repository sets `noPropertyAccessFromIndexSignature`, so the
 * literal `process.env.NEXT_PUBLIC_X` dot-access that Next.js requires in
 * order to INLINE a value into a static export would otherwise not compile.
 * And this file then becomes the one place that states what the app can be
 * configured with — a list nobody has to grep for.
 *
 * Every one is optional on purpose. A build with none of them set is a real,
 * supported build: it runs entirely on the device and says so on its Account
 * screen rather than implying a backup that is not happening.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** Marketing version, e.g. "1.0.0". Normally from store/release.json. */
    readonly NEXT_PUBLIC_APP_VERSION?: string;
    /** Build number. Must increase with every store upload. */
    readonly NEXT_PUBLIC_BUILD_NUMBER?: string;
    /** Supabase project URL. Public: it is in every request. */
    readonly NEXT_PUBLIC_SUPABASE_URL?: string;
    /**
     * Supabase publishable (anon) key. Browser-visible by design. NOT a
     * security boundary — Row Level Security is. The service-role key is never
     * referenced anywhere in this app.
     */
    readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    /** Support address shown in-app. Required before a store submission. */
    readonly NEXT_PUBLIC_SUPPORT_EMAIL?: string;
  }
}
