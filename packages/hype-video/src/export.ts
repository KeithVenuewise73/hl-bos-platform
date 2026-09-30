/**
 * The downloadable package.
 *
 * Three formats of the same content: plain text (paste anywhere), Markdown
 * (docs, notes apps) and JSON (the hand-off to a future video, music or voice
 * service, or to AthleteHuddle / HomeHuddle). Every format says what produced
 * it, so a template-written package is never passed off as AI-written.
 */

import { findTemplate } from "./templates.ts";
import type { GenerationRecord, HypePackage, OutputType, Tone } from "./types.ts";

export type ExportFormat = "txt" | "md" | "json";

export interface ExportMeta {
  readonly projectName: string;
  readonly templateKey: string;
  readonly tone: Tone;
  readonly outputTypes: readonly OutputType[];
}

interface Section {
  readonly heading: string;
  readonly body: string;
  /** Which output type this section belongs to, for ordering. */
  readonly type: OutputType | null;
}

function sections(pkg: HypePackage): Section[] {
  return [
    { heading: "Title", body: pkg.title, type: null },
    { heading: "15-second script", body: pkg.script15, type: "hype_script" },
    { heading: "30-second script", body: pkg.script30, type: "hype_script" },
    { heading: "Voiceover narration", body: pkg.voiceover, type: "voiceover_script" },
    { heading: "Social caption", body: pkg.socialCaption, type: "short_social_post" },
    {
      heading: "Hashtags",
      body: pkg.hashtags.map((h) => `#${h}`).join(" "),
      type: "caption_package",
    },
    {
      heading: "On-screen text",
      body: pkg.onScreenText.map((b) => `${b.atSecond}s — ${b.text}`).join("\n"),
      type: "caption_package",
    },
    { heading: "AI video prompt", body: pkg.videoPrompt, type: "full_video_prompt" },
    { heading: "AI music prompt", body: pkg.musicPrompt, type: "full_video_prompt" },
    {
      heading: "Sponsor callout",
      body: pkg.sponsorCallout ?? "(no sponsor)",
      type: null,
    },
  ];
}

/** The user's chosen output types first, in the order they picked them. */
export function orderedSections(
  pkg: HypePackage,
  preferred: readonly OutputType[],
): Section[] {
  const all = sections(pkg);
  const title = all.slice(0, 1);
  const rest = all.slice(1);
  const rank = (s: Section): number => {
    const i = s.type === null ? -1 : preferred.indexOf(s.type);
    return i === -1 ? preferred.length : i;
  };
  return [
    ...title,
    ...rest
      .map((s, i) => ({ s, i }))
      .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
      .map((x) => x.s),
  ];
}

export function describeProducer(producedBy: string): string {
  return producedBy.startsWith("claude:")
    ? `Written by Claude (${producedBy.slice("claude:".length)}), checked by 5-Star Hype Video's fact and content checks`
    : "Written by the 5-Star Hype Video template writer (not AI)";
}

export function exportPackage(
  record: GenerationRecord,
  meta: ExportMeta,
  format: ExportFormat,
): { readonly body: string; readonly mimeType: string; readonly extension: string } {
  const template = findTemplate(meta.templateKey)?.name ?? meta.templateKey;
  const producer = describeProducer(record.producedBy);

  if (format === "json") {
    const body = JSON.stringify(
      {
        format: "5-star-hype-package/v1",
        project: meta.projectName,
        template: meta.templateKey,
        tone: meta.tone,
        outputTypes: meta.outputTypes,
        producedBy: record.producedBy,
        generatedAt: record.generatedAt,
        package: record.package,
      },
      null,
      2,
    );
    return { body, mimeType: "application/json", extension: "json" };
  }

  const parts = orderedSections(record.package, meta.outputTypes);
  if (format === "md") {
    const body = [
      `# ${record.package.title}`,
      "",
      `*${meta.projectName} · ${template} · ${meta.tone} · ${producer} · ${record.generatedAt}*`,
      "",
      ...parts.slice(1).flatMap((s) => [`## ${s.heading}`, "", s.body, ""]),
      "---",
      "5-Star Sports Media · 5-Star Hype Video",
      "",
    ].join("\n");
    return { body, mimeType: "text/markdown; charset=utf-8", extension: "md" };
  }

  const rule = "=".repeat(60);
  const body = [
    "5-STAR HYPE VIDEO — HYPE PACKAGE",
    rule,
    `Project:   ${meta.projectName}`,
    `Template:  ${template}`,
    `Tone:      ${meta.tone}`,
    `Generated: ${record.generatedAt}`,
    producer,
    rule,
    "",
    ...parts.flatMap((s) => [
      s.heading.toUpperCase(),
      "-".repeat(s.heading.length),
      s.body,
      "",
    ]),
    rule,
    "5-Star Sports Media",
    "",
  ].join("\n");
  return { body, mimeType: "text/plain; charset=utf-8", extension: "txt" };
}

/** A filename that is safe on every OS. */
export function exportFilename(projectName: string, extension: string): string {
  const slug =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "hype-package";
  return `${slug}.${extension}`;
}
