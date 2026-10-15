// The Presence Scanner's console logic: reading the scan form, running a scan
// against a repository, applying reviewer actions, and filtering the Lead
// Board. No "server-only", no file system and no network here -- everything is
// injected -- so all of it is tested directly (presence.test.ts). The server
// actions in src/actions/presence.ts are thin wrappers over these functions.

import type { LeadRow } from "./lead-board";
import {
  addNote,
  clearQualificationOverride,
  correctField,
  effectiveQualification,
  isVertical,
  LEAD_STAGES,
  overrideQualification,
  rankProspects,
  rescanProspect,
  ReviewerInputError,
  runMarketScan,
  StageTransitionError,
  topFindings,
  transitionStage,
  validateRequest,
  type CorrectableField,
  type LeadStage,
  type PlacesClient,
  type PresenceRepository,
  type Prospect,
  type QualificationStatus,
  type ScanRequest,
  type ScanRun,
  type ScoringConfig,
  type WebEgress,
} from "@hl-bos/presence-scanner";
import { isSiteVertical } from "@hl-bos/site-builder";

export interface PresenceDeps {
  repo: PresenceRepository;
  places: PlacesClient | null;
  egress: WebEgress;
  now: () => Date;
  newId: () => string;
  actor: string;
  config?: ScoringConfig;
}

export interface PresenceResult {
  ok: boolean;
  headline: string;
  meaning: string;
  href?: string;
}

const text = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

/** The scan form -> a ScanRequest, or the problems in plain English. */
export function parseScanForm(fd: FormData): {
  request?: ScanRequest;
  errors: string[];
} {
  const vertical = text(fd, "vertical");
  const source = text(fd, "source") === "google_places" ? "google_places" : "import";
  const request: ScanRequest = {
    market: text(fd, "market"),
    zip: text(fd, "zip") || undefined,
    radiusMiles: Number(text(fd, "radius") || "10"),
    vertical: isVertical(vertical) ? vertical : "contractor",
    maxResults: Number(text(fd, "maxResults") || "20"),
    searchTerms: text(fd, "searchTerms") || undefined,
    source,
    importText: source === "import" ? text(fd, "importText") : undefined,
  };
  const errors = isVertical(vertical)
    ? validateRequest(request)
    : ["Choose a business vertical."];
  return errors.length ? { errors } : { request, errors };
}

/** Run a scan and store its results. */
export async function startScan(
  fd: FormData,
  deps: PresenceDeps,
): Promise<PresenceResult & { run?: ScanRun }> {
  const { request, errors } = parseScanForm(fd);
  if (!request)
    return {
      ok: false,
      headline: "The scan did not start.",
      meaning: errors.join(" "),
    };
  const { run, prospects } = await runMarketScan(request, {
    places: deps.places,
    egress: deps.egress,
    now: deps.now,
    newId: deps.newId,
    existing: await deps.repo.listProspects(),
    actor: deps.actor,
    ...(deps.config ? { config: deps.config } : {}),
  });
  await deps.repo.saveProspects(prospects);
  await deps.repo.saveScan(run);
  if (run.error)
    return { ok: false, headline: "The scan could not run.", meaning: run.error, run };
  const c = run.counts;
  return {
    ok: true,
    headline: `Scan finished: ${c.unique} business${c.unique === 1 ? "" : "es"} scored.`,
    meaning:
      `${c.discovered} found, ${c.duplicates} duplicate${c.duplicates === 1 ? "" : "s"} merged, ` +
      `${c.qualified} qualified, ${c.needsReview} to review, ${c.excluded} excluded.` +
      (run.apiUsage
        ? ` Google: ${run.apiUsage.requests} request${run.apiUsage.requests === 1 ? "" : "s"}, about US$${run.apiUsage.estimatedCostUsd.toFixed(2)} at list price.`
        : "") +
      (run.warnings.length ? ` Notes: ${run.warnings.join(" ")}` : ""),
    run,
  };
}

/** Apply a reviewer action to one lead, persist it, and say what happened. */
export async function reviewLead(
  id: string,
  action:
    | { kind: "stage"; to: string; note: string }
    | { kind: "note"; text: string }
    | { kind: "override"; status: string; note: string }
    | { kind: "clear_override" }
    | { kind: "correct"; field: string; value: string }
    | { kind: "rescan" },
  deps: PresenceDeps,
): Promise<PresenceResult> {
  const p = await deps.repo.getProspect(id);
  if (!p)
    return {
      ok: false,
      headline: "That lead was not found.",
      meaning: "It may have been removed. Reload the Lead Board.",
    };
  const now = deps.now();
  try {
    let next: Prospect;
    let headline: string;
    switch (action.kind) {
      case "stage": {
        if (!LEAD_STAGES.some((s) => s.key === action.to))
          return {
            ok: false,
            headline: "Unknown stage.",
            meaning: `"${action.to}" is not a lead stage.`,
          };
        next = transitionStage(p, action.to as LeadStage, deps.actor, action.note, now);
        headline = `Moved to ${LEAD_STAGES.find((s) => s.key === action.to)!.label}.`;
        break;
      }
      case "note":
        next = addNote(p, action.text, deps.actor, now);
        headline = "Note saved.";
        break;
      case "override": {
        const allowed: QualificationStatus[] = [
          "qualified",
          "excluded",
          "needs_review",
        ];
        if (!allowed.includes(action.status as QualificationStatus))
          return {
            ok: false,
            headline: "Unknown qualification.",
            meaning: `"${action.status}" is not a qualification.`,
          };
        next = overrideQualification(
          p,
          action.status as QualificationStatus,
          action.note,
          deps.actor,
          now,
        );
        headline = "Override saved.";
        break;
      }
      case "clear_override":
        next = clearQualificationOverride(p, deps.actor, now);
        headline = "Back to the automatic qualification.";
        break;
      case "correct": {
        if (!["website", "phone", "email"].includes(action.field))
          return {
            ok: false,
            headline: "That field cannot be corrected.",
            meaning: "Website, phone and email can be corrected.",
          };
        const r = correctField(
          p,
          action.field as CorrectableField,
          action.value,
          deps.actor,
          now,
        );
        next = r.needsRescan ? await rescanProspect(r.prospect, deps) : r.prospect;
        headline = r.needsRescan ? "Corrected and re-inspected." : "Corrected.";
        break;
      }
      case "rescan":
        next = await rescanProspect(p, deps);
        headline = "Re-inspected.";
        break;
    }
    await deps.repo.saveProspects([next]);
    return {
      ok: true,
      headline,
      meaning: `Opportunity Score ${next.score.total}${next.score.total !== p.score.total ? ` (was ${p.score.total})` : ""}. Recorded in the lead's history.`,
    };
  } catch (e) {
    if (e instanceof ReviewerInputError || e instanceof StageTransitionError)
      return { ok: false, headline: "Not saved.", meaning: e.message };
    throw e;
  }
}

// --- Lead Board ---------------------------------------------------------------

export type { LeadRow } from "./lead-board";

export function toLeadRow(p: Prospect): LeadRow {
  const rec = p.places?.record;
  const fromGoogle = rec !== undefined;
  const imported =
    p.importedRating !== undefined || p.importedReviewCount !== undefined;
  return {
    id: p.id,
    name: p.name,
    location: p.address ?? p.market.label,
    market: p.market.label,
    vertical: p.vertical,
    score: p.score.total,
    checkedMax: p.score.checkedMax,
    websiteStatus: p.websiteStatus,
    rating: fromGoogle ? rec.rating : p.importedRating,
    reviews: fromGoogle
      ? (rec.reviewCount ?? (rec.rating === undefined ? 0 : undefined))
      : p.importedReviewCount,
    ratingSource: fromGoogle ? "Google Maps" : imported ? "imported" : undefined,
    topFindings: topFindings(p.score),
    qualification: effectiveQualification(p.qualification),
    overridden: p.qualification.override !== undefined,
    stage: p.stage,
    lastScannedAt: p.lastScannedAt,
    ...batchability(p),
  };
}

function batchability(p: Prospect): { batchable: boolean; batchNote: string } {
  if (p.notes.some((n) => n.text.startsWith("HLG-owned business")))
    return {
      batchable: false,
      batchNote: "HLG-owned: built from its Business Profile",
    };
  if (!isSiteVertical(p.vertical))
    return { batchable: false, batchNote: "No demo template for this vertical yet" };
  if (effectiveQualification(p.qualification) !== "qualified")
    return { batchable: false, batchNote: "Only qualified leads can be batch-built" };
  return { batchable: true, batchNote: "" };
}

/** All leads in default ranking order. */
export async function leadBoard(repo: PresenceRepository): Promise<Prospect[]> {
  return (await repo.listProspects()).sort(rankProspects);
}
