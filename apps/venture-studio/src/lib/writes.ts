import "server-only";
import {
  getViewer,
  serverSupabase,
  supabaseConfigured,
  firstPartyTenant,
} from "./session";
import { canManage, canDecide } from "./authz";
import {
  validateOpportunity,
  validateEvidenceType,
  validateDecision,
  isHttpUrl,
} from "./validate";

export interface WriteResult {
  ok: boolean;
  status: number;
  error?: string;
  errors?: string[];
  provisioning?: "unconfigured" | "unprovisioned" | "ready";
  id?: string;
}

const FORBIDDEN: WriteResult = { ok: false, status: 403, error: "Not authorized." };

/** Create an opportunity via the governed RPC, under the viewer's session. */
export async function createOpportunity(body: unknown): Promise<WriteResult> {
  const viewer = await getViewer();
  if (!canManage(viewer.role)) return FORBIDDEN;

  const v = validateOpportunity(body ?? {});
  if (!v.ok || !v.value) return { ok: false, status: 422, errors: v.errors };

  if (!supabaseConfigured())
    return { ok: false, status: 503, provisioning: "unconfigured" };
  const tenant = firstPartyTenant();
  if (!tenant)
    return {
      ok: false,
      status: 503,
      provisioning: "unconfigured",
      error: "Tenant not configured (VSTUDIO_TENANT_ID).",
    };

  const sb = await serverSupabase();
  if (!sb) return { ok: false, status: 503, provisioning: "unconfigured" };
  const raw = body as Record<string, unknown>;
  const { data, error } = await sb
    .schema("vstudio")
    .rpc("create_opportunity", {
      p_tenant: tenant,
      p_title: v.value.title,
      p_attrs: {
        summary: v.value.summary,
        industry: v.value.industry,
        opportunity_type: v.value.opportunity_type,
        source_url: v.value.source_url,
        problem_statement:
          typeof raw["problem_statement"] === "string" ? raw["problem_statement"] : "",
        initial_hypothesis:
          typeof raw["initial_hypothesis"] === "string"
            ? raw["initial_hypothesis"]
            : "",
        related_product:
          typeof raw["related_product"] === "string" ? raw["related_product"] : null,
        tags: v.value.tags,
        is_demonstration: raw["is_demonstration"] === true,
      },
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

export async function addEvidence(
  opportunityId: string,
  body: unknown,
): Promise<WriteResult> {
  const viewer = await getViewer();
  if (!canManage(viewer.role)) return FORBIDDEN;

  const raw = (body ?? {}) as Record<string, unknown>;
  const type = validateEvidenceType(raw["evidence_type"]);
  const title = typeof raw["title"] === "string" ? raw["title"].trim() : "";
  const errors: string[] = [];
  if (!type) errors.push("Invalid evidence type.");
  if (title.length < 3) errors.push("Evidence title is required.");
  if (
    raw["source_url"] != null &&
    raw["source_url"] !== "" &&
    !isHttpUrl(raw["source_url"])
  )
    errors.push("Source URL must be a valid http(s) URL.");
  if (errors.length) return { ok: false, status: 422, errors };

  if (!supabaseConfigured())
    return { ok: false, status: 503, provisioning: "unconfigured" };
  const sb = await serverSupabase();
  if (!sb) return { ok: false, status: 503, provisioning: "unconfigured" };
  const { data, error } = await sb
    .schema("vstudio")
    .rpc("add_evidence", {
      p_opportunity: opportunityId,
      p_type: type,
      p_title: title,
      p_attrs: {
        source_url: typeof raw["source_url"] === "string" ? raw["source_url"] : null,
        source_name: typeof raw["source_name"] === "string" ? raw["source_name"] : "",
        excerpt: typeof raw["excerpt"] === "string" ? raw["excerpt"] : "",
        reliability:
          typeof raw["reliability"] === "string" ? raw["reliability"] : "unverified",
        relevance:
          typeof raw["relevance"] === "string" ? raw["relevance"] : "supporting",
      },
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

/** Record the authoritative CEO decision. CEO-only (defense in depth; DB also gates). */
export async function recordDecision(
  opportunityId: string,
  body: unknown,
): Promise<WriteResult> {
  const viewer = await getViewer();
  if (!canDecide(viewer.role))
    return {
      ok: false,
      status: 403,
      error: "Only the CEO role may record a decision.",
    };

  const raw = (body ?? {}) as Record<string, unknown>;
  const decision = validateDecision(raw["decision"]);
  if (!decision) return { ok: false, status: 422, errors: ["Invalid decision."] };

  if (!supabaseConfigured())
    return { ok: false, status: 503, provisioning: "unconfigured" };
  const sb = await serverSupabase();
  if (!sb) return { ok: false, status: 503, provisioning: "unconfigured" };
  const { data, error } = await sb
    .schema("vstudio")
    .rpc("record_decision", {
      p_opportunity: opportunityId,
      p_decision: decision,
      p_attrs: {
        rationale: typeof raw["rationale"] === "string" ? raw["rationale"] : "",
        conditions: typeof raw["conditions"] === "string" ? raw["conditions"] : "",
      },
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
