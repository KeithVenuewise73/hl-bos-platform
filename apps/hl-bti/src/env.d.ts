// Typed public env so `process.env.NEXT_PUBLIC_*` dot-access typechecks under
// noUncheckedIndexedAccess AND is still string-replaced by Next at build time
// (Next inlines dot-access to process.env.NEXT_PUBLIC_*; bracket access is not
// inlined, so it must stay dot-access here).
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_SUPABASE_URL?: string;
    readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  }
}
