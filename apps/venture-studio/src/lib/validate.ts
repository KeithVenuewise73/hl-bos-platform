/**
 * Input validation — PURE, unit-tested. Used by the write route handlers before
 * any RPC call. Validates required fields and structured inputs (URLs) so bad
 * data never reaches the database.
 */
import {
  OPPORTUNITY_TYPES,
  EVIDENCE_TYPES,
  DECISIONS,
  type OpportunityType,
  type EvidenceType,
  type Decision,
} from "@hl-bos/venture-studio";

export function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\/[^\s]+$/.test(v);
}

export interface OpportunityInput {
  title?: unknown;
  summary?: unknown;
  industry?: unknown;
  opportunity_type?: unknown;
  source_url?: unknown;
  tags?: unknown;
}

export interface Validated<T> {
  ok: boolean;
  errors: string[];
  value: T | null;
}

export interface CleanOpportunity {
  title: string;
  summary: string;
  industry: string;
  opportunity_type: OpportunityType | null;
  source_url: string | null;
  tags: string[];
}

export function validateOpportunity(
  input: OpportunityInput,
): Validated<CleanOpportunity> {
  const errors: string[] = [];
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < 3) errors.push("Title is required (min 3 characters).");
  if (title.length > 300) errors.push("Title is too long (max 300).");

  let opportunity_type: OpportunityType | null = null;
  if (input.opportunity_type != null && input.opportunity_type !== "") {
    if (OPPORTUNITY_TYPES.includes(input.opportunity_type as OpportunityType)) {
      opportunity_type = input.opportunity_type as OpportunityType;
    } else {
      errors.push("Invalid opportunity type.");
    }
  }

  let source_url: string | null = null;
  if (input.source_url != null && input.source_url !== "") {
    if (isHttpUrl(input.source_url)) source_url = input.source_url;
    else errors.push("Source URL must be a valid http(s) URL.");
  }

  const tags = Array.isArray(input.tags)
    ? input.tags
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim())
    : [];

  if (errors.length > 0) return { ok: false, errors, value: null };
  return {
    ok: true,
    errors: [],
    value: {
      title,
      summary: typeof input.summary === "string" ? input.summary.trim() : "",
      industry: typeof input.industry === "string" ? input.industry.trim() : "",
      opportunity_type,
      source_url,
      tags,
    },
  };
}

export function validateEvidenceType(v: unknown): EvidenceType | null {
  return typeof v === "string" && EVIDENCE_TYPES.includes(v as EvidenceType)
    ? (v as EvidenceType)
    : null;
}

export function validateDecision(v: unknown): Decision | null {
  return typeof v === "string" && DECISIONS.includes(v as Decision)
    ? (v as Decision)
    : null;
}
