/** An asset URL from the host is used only if it is https or site-relative. Anything else is dropped. */
export function safeAssetUrl(u: string | undefined): string | undefined {
  if (u === undefined) return undefined;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  if (!u.startsWith("https://")) return undefined;
  try {
    return new URL(u).protocol === "https:" ? u : undefined;
  } catch {
    return undefined;
  }
}

/** The canonical origin: https only, no path. Throws, because a wrong canonical is an SEO bug nobody notices. */
export function canonicalOrigin(origin: string): string {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    throw new Error(`ctx.origin is not a URL: ${origin}`);
  }
  if (u.protocol !== "https:") throw new Error("ctx.origin must be https");
  return u.origin;
}
