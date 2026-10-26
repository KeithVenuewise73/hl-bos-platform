/**
 * Where to go after signing in. Only a path on this app ("/import?..."),
 * never another site: "//evil.example", "https://..." and "/\\evil" are all
 * refused, so a link cannot use sign-in to send someone elsewhere.
 */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 4000) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\"))
    return null;
  if ([...raw].some((c) => c.charCodeAt(0) < 0x20)) return null;
  return raw;
}
