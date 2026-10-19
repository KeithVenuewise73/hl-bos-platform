// Export: the demo as a ZIP (index.html, the launch checklist, a README),
// using JerseySort's existing streaming ZIP writer.

import { zipStore, type ZipEntry } from "@hl-bos/jersey-sort";

import { renderSite } from "./render.ts";
import type { SiteDraft } from "./types.ts";

export function checklistMarkdown(d: SiteDraft): string {
  const lines = [
    `# ${d.mode === "internal_draft" ? "Launch readiness" : "Launch checklist"} — ${d.facts.businessName}`,
    "",
    `Demo version ${d.version}, ${d.status}${d.approved ? ` (approved by ${d.approved.by} on ${d.approved.at.slice(0, 10)})` : ""}. Prepared ${d.updatedAt.slice(0, 10)}.`,
    "Nothing on this list has been done. Domain, hosting and anything paid are decisions, not steps.",
    "",
  ];
  for (const i of d.checklist)
    lines.push(
      `- [ ] **${i.area}** — ${i.task}`,
      `  - Why: ${i.why}`,
      `  - Owner: ${i.owner}`,
    );
  return `${lines.join("\n")}\n`;
}

export function readme(d: SiteDraft): string {
  if (d.mode === "internal_draft")
    return [
      `INTERNAL DRAFT — ${d.facts.businessName} (not published)`,
      "",
      `Version ${d.version}, prepared ${d.updatedAt.slice(0, 10)} from the verified Business Profile for internal review.`,
      "This draft must not be published without explicit CEO approval.",
      "It is marked noindex. It runs no scripts. The contact form is switched off.",
      d.infoRequired?.length
        ? `Information required before launch: ${d.infoRequired.join("; ")}.`
        : "",
      "",
      "Files: index.html (the page, one file, no scripts), LAUNCH-CHECKLIST.md (launch readiness).",
      "",
    ]
      .filter((l, i, a) => l !== "" || a[i - 1] !== "")
      .join("\n");
  return [
    `DEMO WEBSITE — ${d.facts.businessName}`,
    "",
    `Prepared by Herman Legacy Group on ${d.updatedAt.slice(0, 10)} for review by the business owner.`,
    "This is not the business's official website and must not be published without the owner's approval.",
    "It is marked noindex so search engines will not list it.",
    "Items marked SAMPLE are placeholders. The contact form is switched off.",
    d.options.showRating && d.facts.rating
      ? "The rating shown comes from Google Maps."
      : "",
    "",
    "Files: index.html (the page, one file, no scripts), LAUNCH-CHECKLIST.md.",
    "",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "demo";

export function zipFileName(d: SiteDraft): string {
  return `hlg-${d.mode === "internal_draft" ? "internal-draft" : "demo"}-${slug(d.facts.businessName)}-v${d.version}.zip`;
}

export async function draftZip(d: SiteDraft, now: Date): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const folder = slug(d.facts.businessName);
  const entries: ZipEntry[] = [
    { name: `${folder}/index.html`, data: enc.encode(renderSite(d)), modified: now },
    {
      name: `${folder}/LAUNCH-CHECKLIST.md`,
      data: enc.encode(checklistMarkdown(d)),
      modified: now,
    },
    { name: `${folder}/README.txt`, data: enc.encode(readme(d)), modified: now },
  ];
  const parts: Uint8Array[] = [];
  for await (const chunk of zipStore(entries)) parts.push(chunk);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
