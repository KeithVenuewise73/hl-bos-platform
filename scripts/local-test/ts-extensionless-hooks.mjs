// A resolver hook so plain Node can run the console's TypeScript directly.
//
// The Control Center is bundled by Next, so its imports are extensionless
// (`./shop-audit-sql`). Node's ESM resolver requires a real file. Rather than
// change the app's import style for the sake of a test harness -- which would
// mean touching every file the app actually ships -- this appends `.ts` when a
// relative specifier does not resolve on its own.
//
// Used only by scripts/local-test. Nothing shipped depends on it.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return await next(specifier + ".ts", context);
    }
    throw err;
  }
}
