// HTML helpers shared by both renderers.

import type { SiteDraft } from "./types.ts";
import { verticalDef } from "./verticals.ts";

export const esc = (s: string | number | undefined | null): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function initials(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return (
    words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? "?").slice(0, 2)
  ).toUpperCase();
}

export const sampleTag = (on: boolean) =>
  on
    ? '<span class="sample" title="Sample content: replace before launch">Sample</span>'
    : "";

/** JSON for a <script type="application/ld+json"> block, safe inside HTML. */
export function jsonLd(draft: SiteDraft): string {
  const f = draft.facts;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": verticalDef(draft.vertical).schemaType(f),
    name: f.businessName,
  };
  if (f.phone) data["telephone"] = f.phone;
  if (f.address) data["address"] = f.address;
  if (f.email) data["email"] = f.email;
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
