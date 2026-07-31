/**
 * CONTENT MANUFACTURING — repeatable workflows (Execution Phase 3A).
 *
 * A repeatable manufacturing line for every content format Herman Legacy
 * Marketing produces. Each type declares which AI Marketing Studio generation
 * kinds it needs and which channel it targets; the manufacturing workflow (the
 * stages) is the SAME for all of them and rides on the existing workflow engine +
 * approval gate + scheduling. Nothing publishes without human review + approval.
 */

import type { GenerationCapability } from "./marketing-studio";

export type ContentFormat =
  | "short_video"
  | "long_video"
  | "social_post"
  | "article"
  | "web_page"
  | "email"
  | "document";

export interface ContentType {
  name: string;
  format: ContentFormat;
  channel: string;
  /** Studio generation kinds this content requires. */
  generationKinds: GenerationCapability["kind"][];
}

/** The 15 content types the brief names, each with its generation recipe. */
export const CONTENT_TYPES: ContentType[] = [
  {
    name: "TikTok",
    format: "short_video",
    channel: "TikTok",
    generationKinds: ["script", "video", "voice", "caption"],
  },
  {
    name: "Instagram Reels",
    format: "short_video",
    channel: "Instagram",
    generationKinds: ["script", "video", "voice", "caption"],
  },
  {
    name: "Facebook",
    format: "social_post",
    channel: "Facebook",
    generationKinds: ["script", "image", "caption"],
  },
  {
    name: "YouTube Shorts",
    format: "short_video",
    channel: "YouTube",
    generationKinds: ["script", "video", "voice", "caption"],
  },
  {
    name: "YouTube Long Form",
    format: "long_video",
    channel: "YouTube",
    generationKinds: ["script", "video", "voice", "caption"],
  },
  {
    name: "LinkedIn",
    format: "social_post",
    channel: "LinkedIn",
    generationKinds: ["script", "image", "caption"],
  },
  {
    name: "Blogs",
    format: "article",
    channel: "Website / Blog",
    generationKinds: ["script"],
  },
  {
    name: "Website Content",
    format: "web_page",
    channel: "Website",
    generationKinds: ["script"],
  },
  {
    name: "Landing Pages",
    format: "web_page",
    channel: "Website",
    generationKinds: ["script", "image"],
  },
  {
    name: "Email Campaigns",
    format: "email",
    channel: "Email",
    generationKinds: ["script"],
  },
  {
    name: "Press Releases",
    format: "article",
    channel: "PR / Website",
    generationKinds: ["script"],
  },
  {
    name: "Customer Success Stories",
    format: "article",
    channel: "Website / LinkedIn",
    generationKinds: ["script", "image"],
  },
  {
    name: "Case Studies",
    format: "document",
    channel: "Website / Documents",
    generationKinds: ["script", "image"],
  },
  {
    name: "Product Launches",
    format: "short_video",
    channel: "Multi-channel",
    generationKinds: ["script", "image", "video", "caption"],
  },
  {
    name: "Educational Content",
    format: "long_video",
    channel: "Multi-channel",
    generationKinds: ["script", "image", "video"],
  },
];

export interface ManufacturingStage {
  seq: number;
  name: string;
  /** The existing system that performs this stage. */
  mechanism: string;
  gated: boolean;
}

/** The one repeatable content manufacturing workflow (same for every type). */
export const CONTENT_MANUFACTURING_WORKFLOW: ManufacturingStage[] = [
  { seq: 1, name: "Brief", mechanism: "Campaign → content brief", gated: false },
  {
    seq: 2,
    name: "Script generation",
    mechanism: "AI Marketing Studio → AI Gateway (deferred)",
    gated: false,
  },
  {
    seq: 3,
    name: "Visual generation",
    mechanism: "AI Marketing Studio → AI Gateway (deferred)",
    gated: false,
  },
  {
    seq: 4,
    name: "Voice generation",
    mechanism: "AI Marketing Studio → AI Gateway (deferred)",
    gated: false,
  },
  {
    seq: 5,
    name: "Assemble",
    mechanism: "Documents / Media composition",
    gated: false,
  },
  { seq: 6, name: "Human review", mechanism: "Workflow reviewer task", gated: true },
  { seq: 7, name: "Approval", mechanism: "Human-approval gate", gated: true },
  { seq: 8, name: "Schedule", mechanism: "Scheduling (Venuewise)", gated: false },
  {
    seq: 9,
    name: "Publish",
    mechanism: "Channel connectors (net-new) — deferred",
    gated: true,
  },
  {
    seq: 10,
    name: "Measure",
    mechanism: "Analytics + Reporting → Growth Dashboard",
    gated: false,
  },
];

export interface ContentManufacturing {
  types: ContentType[];
  workflow: ManufacturingStage[];
  typeCount: number;
  gatedStages: number;
  /** Distinct generation kinds used across all content types. */
  generationKindsUsed: GenerationCapability["kind"][];
  summary: string;
}

/** The content manufacturing model (deliverable 4). */
export function contentManufacturing(): ContentManufacturing {
  const kinds = [...new Set(CONTENT_TYPES.flatMap((t) => t.generationKinds))].sort();
  return {
    types: CONTENT_TYPES,
    workflow: CONTENT_MANUFACTURING_WORKFLOW,
    typeCount: CONTENT_TYPES.length,
    gatedStages: CONTENT_MANUFACTURING_WORKFLOW.filter((s) => s.gated).length,
    generationKindsUsed: kinds,
    summary:
      `${CONTENT_TYPES.length} content types on one repeatable 10-stage workflow ` +
      `(review + approval + publish gated). Publishing and AI generation are deferred.`,
  };
}
