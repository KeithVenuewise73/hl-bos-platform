import "server-only";
import { serverSupabase, supabaseConfigured, firstPartyTenant } from "./session";
import { getViewer } from "./session";
import { canManage } from "./authz";
import {
  analyzeReuse,
  computeFactoryReadiness,
  summarizeEvaluation,
  assembleIntelligenceObject,
  NOTE_TYPES,
  TASK_STATUSES,
  type NotebookEntry,
  type NotebookEntryKind,
  type IntelligenceProgramKey,
  type IntelligenceObject,
  type IntelligenceContext,
  type TaskStatus,
  type DimensionScore,
} from "@hl-bos/venture-studio";
import type { Provisioning } from "./data";
import type { WriteResult } from "./writes";

/**
 * Server-only data + write layer for the CEO Notebook. Reads/writes the
 * EXISTING `vstudio.notes` (extended in migration 0030) under the viewer's
 * session (RLS-enforced). Honest provisioning states; never fabricates.
 */

interface NoteRow {
  id: string;
  note_type: string;
  title: string | null;
  body: string;
  status: string | null;
  program: string | null;
  opportunity_id: string | null;
  due_date: string | null;
  created_at: string;
}

const SELECT =
  "id,note_type,title,body,status,program,opportunity_id,due_date,created_at";

function toEntry(r: NoteRow): NotebookEntry {
  return {
    id: r.id,
    kind: r.note_type as NotebookEntryKind,
    title: r.title,
    body: r.body,
    status: (r.status ?? "open") as TaskStatus,
    program: (r.program as IntelligenceProgramKey | null) ?? null,
    opportunityId: r.opportunity_id,
    dueDate: r.due_date,
    createdAt: r.created_at,
  };
}

export interface NotebookList {
  provisioning: Provisioning;
  entries: NotebookEntry[];
}

export async function listNotebookEntries(): Promise<NotebookList> {
  if (!supabaseConfigured()) return { provisioning: "unconfigured", entries: [] };
  const sb = await serverSupabase();
  if (!sb) return { provisioning: "unconfigured", entries: [] };
  try {
    const { data, error } = await sb
      .schema("vstudio")
      .from("notes")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<NoteRow[]>();
    if (error) return { provisioning: "unprovisioned", entries: [] };
    return { provisioning: "ready", entries: (data ?? []).map(toEntry) };
  } catch {
    return { provisioning: "unprovisioned", entries: [] };
  }
}

export interface NotebookEntryDetail {
  provisioning: Provisioning;
  object: IntelligenceObject | null;
}

interface OppRow {
  id: string;
  title: string;
  summary: string;
  status: string;
  tags: string[];
}

export async function getNotebookEntry(id: string): Promise<NotebookEntryDetail> {
  if (!supabaseConfigured()) return { provisioning: "unconfigured", object: null };
  const sb = await serverSupabase();
  if (!sb) return { provisioning: "unconfigured", object: null };
  try {
    const { data: row, error } = await sb
      .schema("vstudio")
      .from("notes")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle()
      .returns<NoteRow>();
    if (error) return { provisioning: "unprovisioned", object: null };
    if (!row) return { provisioning: "ready", object: null };
    const entry = toEntry(row);

    const ctx: IntelligenceContext = {};
    if (entry.opportunityId) {
      const oppId = entry.opportunityId;
      const { data: opp } = await sb
        .schema("vstudio")
        .from("opportunities")
        .select("id,title,summary,status,tags")
        .eq("id", oppId)
        .maybeSingle()
        .returns<OppRow>();
      const { data: ev } = await sb
        .schema("vstudio")
        .from("evidence")
        .select("id,title,evidence_type,reliability")
        .eq("opportunity_id", oppId)
        .returns<
          { id: string; title: string; evidence_type: string; reliability: string }[]
        >();
      const { data: dec } = await sb
        .schema("vstudio")
        .from("decisions")
        .select("id,decision,decided_at")
        .eq("opportunity_id", oppId)
        .order("decided_at", { ascending: false })
        .returns<{ id: string; decision: string; decided_at: string }[]>();
      const { data: notes } = await sb
        .schema("vstudio")
        .from("notes")
        .select(SELECT)
        .eq("opportunity_id", oppId)
        .neq("id", id)
        .returns<NoteRow[]>();

      if (ev)
        ctx.evidence = ev.map((e) => ({
          id: e.id,
          title: e.title,
          evidenceType: e.evidence_type,
          reliability: e.reliability,
        }));
      if (dec)
        ctx.decisions = dec.map((d) => ({
          id: d.id,
          decision: d.decision,
          decidedAt: d.decided_at,
        }));
      if (notes) ctx.siblingNotes = notes.map(toEntry);

      if (opp) {
        const reuse = analyzeReuse({ title: opp.title, summary: opp.summary });
        const verified = (ctx.evidence ?? []).some(
          (e) => e.evidenceType === "verified_fact",
        );
        const factory = computeFactoryReadiness({
          decision: null,
          evaluation: summarizeEvaluation([] as DimensionScore[]),
          reuse,
          evidenceCount: (ctx.evidence ?? []).length,
          hasVerifiedEvidence: verified,
        });
        ctx.reuse = {
          score: reuse.reuseScore,
          verdict: reuse.verdict,
          formula: reuse.formula,
        };
        ctx.factory = {
          ready: factory.ready,
          reusableCapabilityCount: factory.reusableCapabilityCount,
          blockers: factory.blockers,
        };
        // Related = opportunities sharing at least one tag (a real relation).
        if (opp.tags.length > 0) {
          const { data: rel } = await sb
            .schema("vstudio")
            .from("opportunities")
            .select("id,title,status,tags")
            .neq("id", oppId)
            .overlaps("tags", opp.tags)
            .limit(5)
            .returns<OppRow[]>();
          if (rel && rel.length > 0)
            ctx.relatedOpportunities = rel.map((o) => ({
              id: o.id,
              title: o.title,
              status: o.status,
            }));
        }
      }
    }

    return { provisioning: "ready", object: assembleIntelligenceObject(entry, ctx) };
  } catch {
    return { provisioning: "unprovisioned", object: null };
  }
}

// --- Writes -----------------------------------------------------------------

const FORBIDDEN: WriteResult = { ok: false, status: 403, error: "Not authorized." };

export function isNotebookKind(v: unknown): v is NotebookEntryKind {
  return typeof v === "string" && (NOTE_TYPES as readonly string[]).includes(v);
}
export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
}

export async function createNotebookEntry(body: unknown): Promise<WriteResult> {
  const viewer = await getViewer();
  if (!canManage(viewer.role)) return FORBIDDEN;

  const raw = (body ?? {}) as Record<string, unknown>;
  const kind = raw["kind"];
  const text = typeof raw["body"] === "string" ? raw["body"].trim() : "";
  const errors: string[] = [];
  if (!isNotebookKind(kind)) errors.push("Invalid entry kind.");
  if (text.length < 1) errors.push("Entry body is required.");
  if (text.length > 10000) errors.push("Entry is too long (max 10000).");
  const status = raw["status"];
  if (status != null && status !== "" && !isTaskStatus(status))
    errors.push("Invalid status.");
  if (errors.length) return { ok: false, status: 422, errors };

  if (!supabaseConfigured())
    return { ok: false, status: 503, provisioning: "unconfigured" };
  const tenant = firstPartyTenant();
  const opportunityId =
    typeof raw["opportunity_id"] === "string" && raw["opportunity_id"]
      ? raw["opportunity_id"]
      : null;
  if (!tenant && !opportunityId)
    return {
      ok: false,
      status: 503,
      provisioning: "unconfigured",
      error: "Tenant not configured (VSTUDIO_TENANT_ID) for a standalone entry.",
    };

  const sb = await serverSupabase();
  if (!sb) return { ok: false, status: 503, provisioning: "unconfigured" };
  const attrs: Record<string, unknown> = {
    title: typeof raw["title"] === "string" ? raw["title"] : "",
    status: isTaskStatus(status) ? status : "open",
    program: typeof raw["program"] === "string" ? raw["program"] : "",
    due_date: typeof raw["due_date"] === "string" ? raw["due_date"] : "",
    decision_relevant: raw["decision_relevant"] === true,
  };
  if (opportunityId) attrs["opportunity_id"] = opportunityId;

  const { data, error } = await sb
    .schema("vstudio")
    .rpc("create_notebook_entry", {
      p_tenant: tenant,
      p_kind: kind,
      p_body: text,
      p_attrs: attrs,
    })
    .returns<string>();
  if (error)
    return {
      ok: false,
      status: 503,
      provisioning: "unprovisioned",
      error: "Schema not yet provisioned.",
    };
  return {
    ok: true,
    status: 201,
    provisioning: "ready",
    ...(typeof data === "string" ? { id: data } : {}),
  };
}

export async function setNotebookEntryStatus(
  id: string,
  body: unknown,
): Promise<WriteResult> {
  const viewer = await getViewer();
  if (!canManage(viewer.role)) return FORBIDDEN;

  const raw = (body ?? {}) as Record<string, unknown>;
  const status = raw["status"];
  if (!isTaskStatus(status))
    return { ok: false, status: 422, errors: ["Invalid status."] };

  if (!supabaseConfigured())
    return { ok: false, status: 503, provisioning: "unconfigured" };
  const sb = await serverSupabase();
  if (!sb) return { ok: false, status: 503, provisioning: "unconfigured" };
  const { error } = await sb
    .schema("vstudio")
    .rpc("set_notebook_entry_status", { p_id: id, p_status: status });
  if (error)
    return {
      ok: false,
      status: 503,
      provisioning: "unprovisioned",
      error: "Schema not yet provisioned.",
    };
  return { ok: true, status: 200, provisioning: "ready" };
}
