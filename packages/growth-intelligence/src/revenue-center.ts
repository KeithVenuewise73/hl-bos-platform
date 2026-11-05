// The canonical HLG Revenue Center workflow, persisted in HL-BOS.
//
//   discover      -> revenue.register_prospect  (dedupe, industry, campaign, source, synthetic flag)
//   Send to Review -> revenue.send_to_review    (ONE transaction, idempotent)
//   proposal      -> visibility.draft_content(kind 'proposal') -> submit_content_for_approval
//   approval      -> revenue.approve_commercial (designated owner only, exact version)
//   outreach      -> revenue.queue_outreach     (approved proposal + consent; held for approval)
//                 -> revenue.approve_commercial -> comms.approve_message  (queued, not sent)
//   reject        -> revenue.set_prospect_status (record kept; dedupe key blocks re-adding)
//   backfill      -> planBackfill + a discovery source + register_prospect
//
// The revenue.* functions are in supabase/proposed/revenue-center (NOT applied
// anywhere). Every rule that matters is enforced by the database, so a direct
// API call cannot skip it; this class only assembles the inputs.
//
// Storage is reached through `HlbosRpc`, which maps one-to-one onto
// supabase-js (`schema(s).rpc(fn, args)`, `schema(s).from(t).select().match()`)
// called with the signed-in user's token on the server — never a service key.

import { createHash } from "node:crypto";

import type { Prospect } from "@hl-bos/presence-scanner";

import {
  industry as industryByKey,
  type Industry,
  type IndustryCounts,
} from "./industries.ts";
import { buildProposal, type PriceBook, type Proposal } from "./proposal.ts";
import {
  buildReview,
  validateReview,
  type OpportunityReview,
  type ReviewOptions,
} from "./review.ts";
import { lineName, routeLead, type Campaign, type RoutingResult } from "./routing.ts";
import type { BusinessLine, Channel, GrowthEvent, GrowthEventKind } from "./types.ts";

export interface HlbosRpc {
  /** Call `schema.fn` with named arguments, as the given user. */
  call<T = unknown>(
    actor: string,
    fn: string,
    args: Record<string, unknown>,
  ): Promise<T>;
  /** Rows of `schema.table` matching every key in `match`, as the given user (RLS applies). */
  rows<T = Record<string, unknown>>(
    actor: string,
    table: string,
    match: Record<string, string>,
  ): Promise<T[]>;
}

export type LineTenants = Record<BusinessLine, string>;

/** Presence Scanner score component -> existing visibility.assessment_categories key. */
export const COMPONENT_TO_CATEGORY = {
  website: "website",
  conversion: "calls_to_action",
  reviews: "reviews",
  profile: "google_business",
  search: "seo",
  social: "social_presence",
} as const;

export type DiscoverySource =
  "mock" | "import" | "google_places" | "inbound_inquiry" | "referral";

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Same formula as revenue.content_sha256 in the database. */
export const contentSha256 = (title: string, body: string) =>
  sha256(`${title}\n${body}`);
/** Same formula as revenue.message_sha256 in the database. */
export const messageSha256 = (
  to: string,
  subject: string | null,
  body: string | null,
) => sha256(`${to}\n${subject ?? ""}\n${body ?? ""}`);

export interface ProspectProfileRow {
  prospect_id: string;
  tenant_id: string;
  industry_key: string;
  campaign_key: string | null;
  dedupe_key: string;
  discovery_source: DiscoverySource;
  is_synthetic: boolean;
  status: "active" | "qualified" | "rejected" | "disqualified";
  status_reason: string | null;
  scan_snapshot: Prospect;
  created_at: string;
}

export type PersistResult =
  | {
      status: "persisted" | "duplicate";
      prospectId: string;
      line: BusinessLine;
      routing: RoutingResult;
    }
  | { status: "needs_review"; routing: RoutingResult };

export interface ReviewPayload {
  scores: { category: string; score: number; note: string }[];
  evidence: {
    key: string;
    kind:
      | "observed"
      | "verified"
      | "customer_provided"
      | "needs_verification"
      | "not_checked"
      | "assumption"
      | "estimate";
    label: string;
    statement: string;
    source: string | null;
    source_ref: string | null;
    observed_at: string | null;
    confidence: string | null;
    how_to_verify: string | null;
    rationale: string | null;
    offer_key: string | null;
    basis: string[];
  }[];
  recommendations: {
    kind: "weakness" | "service";
    title: string;
    detail: string;
    service: string | null;
    priority: number;
    evidence_key: string;
  }[];
}

export interface ReviewResult {
  assessmentId: string;
  growthScore: number;
  replayed: boolean;
  review: OpportunityReview;
}

export interface PendingApproval {
  instanceId: string;
  subject: "proposal" | "outreach";
  title: string;
  body: string;
  /** What the owner is shown, and must send back to approve. */
  sha256: string;
}

const RANK = { critical: 1, high: 2, medium: 3, low: 4 } as const;

/** Map an opportunity review to the atomic Send to Review payload. Deterministic. */
export function reviewPayload(
  lead: Prospect,
  review: OpportunityReview,
): ReviewPayload {
  const scores: ReviewPayload["scores"] = [];
  for (const c of lead.score.components) {
    if (c.status === "not_checked" || c.max === 0) continue; // unchecked is never scored
    scores.push({
      category: COMPONENT_TO_CATEGORY[c.component],
      // Scanner points measure the GAP; the HL-BOS 0-5 score measures QUALITY.
      score: Math.round(5 * (1 - c.awarded / c.max)),
      note: `${c.label}: ${c.awarded}/${c.max} gap points (${lead.score.version}). ${c.note}`.trim(),
    });
  }
  const base = {
    source: null,
    source_ref: null,
    observed_at: null,
    confidence: null,
    how_to_verify: null,
    rationale: null,
    offer_key: null,
    basis: [] as string[],
  };
  const evidence: ReviewPayload["evidence"] = [
    ...review.observed.map((f) => ({
      ...base,
      key: f.key,
      kind:
        f.source === "customer_provided"
          ? ("customer_provided" as const)
          : f.source === "reviewer"
            ? ("verified" as const)
            : ("observed" as const),
      label: f.label,
      statement: `${f.status === "present" ? "Present" : f.status === "missing" ? "Missing" : "Not found"}: ${f.evidence}`,
      source: f.source,
      observed_at: f.observedAt,
      confidence: f.confidence,
    })),
    ...review.needsVerification.map((t, i) => ({
      ...base,
      key: `needs_verification.${i + 1}`,
      kind: "needs_verification" as const,
      label: t.split(":")[0] ?? t,
      statement: t,
    })),
    ...review.notChecked.map((t, i) => ({
      ...base,
      key: `not_checked.${i + 1}`,
      kind: "not_checked" as const,
      label: t.split(":")[0] ?? t,
      statement: t,
    })),
    ...review.assumptions.map((a, i) => ({
      ...base,
      key: `assumption.${i + 1}`,
      kind: "assumption" as const,
      label: "Assumption",
      statement: a.statement,
      how_to_verify: a.howToVerify,
    })),
    ...review.opportunities.map((o) => ({
      ...base,
      key: `estimate.${o.offerKey}`,
      kind: "estimate" as const,
      label: o.offerName,
      statement: `Estimated opportunity, not a measured result: ${o.offerName}.`,
      rationale: o.rationale,
      offer_key: o.offerKey,
      basis: o.basedOn,
    })),
  ];
  const recommendations: ReviewPayload["recommendations"] = [
    ...review.observed
      .filter((f) => f.status !== "present")
      .map((f) => ({
        kind: "weakness" as const,
        title: f.label,
        detail: `OBSERVED (${f.source}, ${f.observedAt.slice(0, 10)}): ${f.evidence}`,
        service: null,
        priority: 3,
        evidence_key: f.key,
      })),
    ...review.opportunities.map((o) => ({
      kind: "service" as const,
      title: o.offerName,
      detail: `ESTIMATED OPPORTUNITY, not a measured result. ${o.rationale}`,
      service: o.offerKey,
      priority: RANK[o.priority],
      evidence_key: `estimate.${o.offerKey}`,
    })),
  ];
  return { scores, evidence, recommendations };
}

export class RevenueCenter {
  constructor(
    private readonly rpc: HlbosRpc,
    private readonly tenants: LineTenants,
    private readonly campaigns: readonly Campaign[] = [],
  ) {}

  lineOfTenant(tenantId: string): BusinessLine {
    if (tenantId === this.tenants.hld) return "hld";
    if (tenantId === this.tenants.hscs) return "hscs";
    throw new WorkflowError(`Tenant ${tenantId} is not an HLG business line.`);
  }

  private async profile(
    actor: string,
    prospectId: string,
  ): Promise<ProspectProfileRow> {
    const [p] = await this.rpc.rows<ProspectProfileRow>(
      actor,
      "revenue.prospect_profiles",
      { prospect_id: prospectId },
    );
    if (!p) throw new WorkflowError("Prospect not found, or not visible to you.");
    return p;
  }

  /**
   * Route a discovered lead to its line and store it there. Uncertain routing,
   * or a campaign whose line disagrees with the industry's, stores nothing.
   * A business already on file (same dedupe key) is reported, not re-added.
   */
  async persistDiscovered(
    actor: string,
    lead: Prospect,
    opts: {
      industryKey: string;
      campaignKey: string;
      source: DiscoverySource;
      isSynthetic: boolean;
    },
  ): Promise<PersistResult> {
    const ind: Industry | undefined = industryByKey(opts.industryKey);
    if (!ind) throw new WorkflowError(`Unknown industry "${opts.industryKey}".`);
    const routing = routeLead(
      {
        origin:
          opts.source === "inbound_inquiry"
            ? "inbound_inquiry"
            : opts.source === "referral"
              ? "referral"
              : "discovered",
        campaignKey: opts.campaignKey,
        inboundSite: undefined,
        vertical: undefined,
        industry: [ind.routingLabel, lead.places?.record.primaryTypeLabel]
          .filter(Boolean)
          .join(" "),
      },
      this.campaigns,
    );
    if (routing.status !== "routed") return { status: "needs_review", routing };
    if (routing.line !== ind.line)
      return {
        status: "needs_review",
        routing: {
          status: "needs_review",
          candidates: [routing.line, ind.line],
          reasons: [
            ...routing.reasons,
            `${ind.label} belongs to ${lineName(ind.line)}.`,
          ],
        },
      };
    const r = await this.rpc.call<{ prospect_id: string; duplicate: boolean }>(
      actor,
      "revenue.register_prospect",
      {
        p_tenant: this.tenants[routing.line],
        p_business: lead.name,
        p_industry: ind.key,
        p_dedupe: lead.dedupeKey,
        p_source: opts.source,
        p_is_synthetic: opts.isSynthetic,
        p_campaign: opts.campaignKey,
        p_email: lead.corrections.email ?? lead.email ?? null,
        p_phone: lead.corrections.phone ?? lead.phone ?? null,
        p_city: lead.market.label,
        p_website: lead.corrections.website ?? lead.website ?? null,
        p_snapshot: lead,
      },
    );
    return {
      status: r.duplicate ? "duplicate" : "persisted",
      prospectId: r.prospect_id,
      line: routing.line,
      routing,
    };
  }

  /** The review the stored evidence produces. Deterministic: same snapshot, same review. */
  async reviewFor(
    actor: string,
    prospectId: string,
    extra: Omit<ReviewOptions, "line" | "now"> = {},
  ): Promise<OpportunityReview> {
    const p = await this.profile(actor, prospectId);
    const lead = p.scan_snapshot;
    return buildReview(lead, {
      ...extra,
      line: this.lineOfTenant(p.tenant_id),
      now: new Date(lead.lastScannedAt),
    });
  }

  /** One click: Send to Review. One database transaction; repeating it is safe. */
  async sendToReview(
    actor: string,
    prospectId: string,
    extra: Omit<ReviewOptions, "line" | "now"> = {},
  ): Promise<ReviewResult> {
    const p = await this.profile(actor, prospectId);
    const review = await this.reviewFor(actor, prospectId, extra);
    const problems = validateReview(review);
    if (problems.length > 0)
      throw new WorkflowError(`Review refused: ${problems.join(" ")}`);
    const payload = reviewPayload(p.scan_snapshot, review);
    const r = await this.rpc.call<{
      assessment_id: string;
      growth_score: number;
      replayed: boolean;
    }>(actor, "revenue.send_to_review", {
      p_prospect: prospectId,
      p_request_key: `scan:${sha256(JSON.stringify(p.scan_snapshot))}`,
      p_payload: payload,
    });
    return {
      assessmentId: r.assessment_id,
      growthScore: r.growth_score,
      replayed: r.replayed,
      review,
    };
  }

  /** Draft the proposal in the prospect's own line; ask the owner only when it is complete. */
  async draftProposal(
    actor: string,
    prospectId: string,
    priceBook?: PriceBook,
  ): Promise<{
    contentId: string;
    proposal: Proposal;
    approvalInstanceId: string | undefined;
  }> {
    const p = await this.profile(actor, prospectId);
    const line = this.lineOfTenant(p.tenant_id);
    const review = await this.reviewFor(actor, prospectId);
    const proposal = buildProposal(review, priceBook ? { priceBook } : {});
    const contentId = await this.rpc.call<string>(actor, "visibility.draft_content", {
      p_tenant: p.tenant_id,
      p_site: null,
      p_kind: "proposal",
      p_title: `Proposal — ${p.scan_snapshot.name} (${lineName(line)})`,
      p_body: JSON.stringify({ prospectId, proposal }),
    });
    if (proposal.status !== "ready_for_approval")
      return { contentId, proposal, approvalInstanceId: undefined };
    const approvalInstanceId = await this.rpc.call<string>(
      actor,
      "visibility.submit_content_for_approval",
      { p_content: contentId },
    );
    await this.rpc.call(actor, "visibility.set_prospect_stage", {
      p_prospect: prospectId,
      p_stage: "proposed",
    });
    return { contentId, proposal, approvalInstanceId };
  }

  /** What the owner is asked to approve, with the hash of that exact version. */
  async pendingApproval(actor: string, instanceId: string): Promise<PendingApproval> {
    const [i] = await this.rpc.rows<{ subject_type: string; subject_id: string }>(
      actor,
      "workflows.instances",
      { id: instanceId },
    );
    if (!i) throw new WorkflowError("Approval not found, or not visible to you.");
    if (i.subject_type === "visibility.content") {
      const [c] = await this.rpc.rows<{ title: string; body: string }>(
        actor,
        "visibility.content_assets",
        { id: i.subject_id },
      );
      if (!c) throw new WorkflowError("Proposal not found.");
      return {
        instanceId,
        subject: "proposal",
        title: c.title,
        body: c.body,
        sha256: contentSha256(c.title, c.body),
      };
    }
    const [m] = await this.rpc.rows<{
      to_contact: string;
      subject: string | null;
      body: string | null;
    }>(actor, "comms.messages", { id: i.subject_id });
    if (!m) throw new WorkflowError("Message not found.");
    return {
      instanceId,
      subject: "outreach",
      title: `To ${m.to_contact}: ${m.subject ?? ""}`,
      body: m.body ?? "",
      sha256: messageSha256(m.to_contact, m.subject, m.body),
    };
  }

  /** The designated owner's decision on exactly the version they were shown. */
  async decide(
    actor: string,
    approval: PendingApproval,
    decision: "approved" | "rejected",
    reason?: string,
  ): Promise<void> {
    await this.rpc.call(actor, "revenue.approve_commercial", {
      p_instance: approval.instanceId,
      p_decision: decision,
      p_content_sha256: approval.sha256,
      p_reason: reason ?? null,
    });
  }

  /** Queue outreach for an approved proposal. The database requires consent and holds it for approval. */
  async requestOutreach(
    actor: string,
    contentId: string,
    to: string,
    vars: { business: string; contact: string; link: string },
  ): Promise<{ messageId: string; approvalInstanceId: string }> {
    const r = await this.rpc.call<{
      message_id: string;
      approval_instance_id: string | null;
    }>(actor, "revenue.queue_outreach", {
      p_content: contentId,
      p_to: to,
      p_vars: vars,
    });
    if (!r.approval_instance_id)
      throw new WorkflowError("Outreach was not held for approval.");
    return { messageId: r.message_id, approvalInstanceId: r.approval_instance_id };
  }

  /** After the owner approves the message: it becomes 'approved' — queued, not sent. */
  async releaseOutreach(actor: string, messageId: string): Promise<void> {
    await this.rpc.call(actor, "comms.approve_message", { p_message: messageId });
  }

  async setStatus(
    actor: string,
    prospectId: string,
    status: "active" | "qualified" | "rejected" | "disqualified",
    reason?: string,
  ): Promise<void> {
    await this.rpc.call(actor, "revenue.set_prospect_status", {
      p_prospect: prospectId,
      p_status: status,
      p_reason: reason ?? null,
    });
  }

  /** Active / qualified / rejected / disqualified per industry, from the database. */
  async industryCounts(
    actor: string,
    opts: { includeSynthetic: boolean },
  ): Promise<IndustryCounts[]> {
    const rows = await this.rpc.rows<ProspectProfileRow>(
      actor,
      "revenue.prospect_profiles",
      {},
    );
    const m = new Map<string, IndustryCounts>();
    for (const r of rows) {
      if (r.is_synthetic && !opts.includeSynthetic) continue;
      const c = m.get(r.industry_key) ?? {
        industryKey: r.industry_key,
        active: 0,
        qualified: 0,
        rejected: 0,
        disqualified: 0,
      };
      c[r.status]++;
      m.set(r.industry_key, c);
    }
    return [...m.values()];
  }

  /** Growth events derived from the database, for the dashboard and the feedback loop. */
  async loadEvents(actor: string): Promise<GrowthEvent[]> {
    const [profiles, assessments, messages] = await Promise.all([
      this.rpc.rows<ProspectProfileRow>(actor, "revenue.prospect_profiles", {}),
      this.rpc.rows<{
        prospect_id: string;
        status: string;
        assessed_at: string | null;
      }>(actor, "visibility.assessments", {}),
      this.rpc.rows<{
        id: string;
        tenant_id: string;
        status: string;
        idempotency_key: string | null;
        updated_at: string;
        source_module: string;
      }>(actor, "comms.messages", {}),
    ]);
    const byId = new Map(profiles.map((p) => [p.prospect_id, p]));
    const out: GrowthEvent[] = [];
    const push = (
      p: ProspectProfileRow,
      kind: GrowthEventKind,
      at: string,
      extra: Partial<GrowthEvent> = {},
    ) =>
      out.push({
        id: `${p.prospect_id}:${kind}:${out.length}`,
        line: this.lineOfTenant(p.tenant_id),
        leadId: p.prospect_id,
        kind,
        at,
        channel: (p.discovery_source === "referral"
          ? "referral"
          : p.discovery_source === "inbound_inquiry"
            ? "unknown"
            : "discovery_outreach") satisfies Channel,
        isDemo: p.is_synthetic,
        industry: industryByKey(p.industry_key)?.label ?? p.industry_key,
        ...extra,
      });
    for (const p of profiles) {
      push(
        p,
        p.discovery_source === "inbound_inquiry"
          ? "inquiry_received"
          : p.discovery_source === "referral"
            ? "referral_received"
            : "discovered",
        p.created_at,
      );
      if (p.status === "qualified") push(p, "qualified", p.created_at);
      if (p.status === "rejected" || p.status === "disqualified")
        push(p, "deal_lost", p.created_at, {
          lostReason: p.status_reason ?? "no reason recorded",
        });
    }
    for (const a of assessments) {
      const p = byId.get(a.prospect_id);
      if (p && a.status === "completed" && a.assessed_at)
        push(p, "review_completed", a.assessed_at);
    }
    // Outreach counts only once a message has actually been delivered (mock or real).
    const contents = await this.rpc.rows<{ id: string; body: string }>(
      actor,
      "visibility.content_assets",
      { kind: "proposal" },
    );
    const contentProspect = new Map<string, string>();
    for (const c of contents) {
      try {
        contentProspect.set(
          c.id,
          (JSON.parse(c.body) as { prospectId: string }).prospectId,
        );
      } catch {
        // A body that is no longer the structured draft (edited outside the app)
        // is not attributed to anyone rather than guessed.
      }
    }
    for (const m of messages) {
      if (m.source_module !== "revenue_center" || !m.idempotency_key) continue;
      const contentId = m.idempotency_key.split(":")[1] ?? "";
      const p = byId.get(contentProspect.get(contentId) ?? "");
      if (p && m.status === "delivered") {
        push(p, "outreach_sent", m.updated_at);
        push(p, "proposal_sent", m.updated_at);
      }
    }
    return out;
  }
}

/** Event kinds the Revenue Center database actually records today. */
export const REVENUE_CENTER_CAPTURED_KINDS: readonly GrowthEventKind[] = [
  "discovered",
  "inquiry_received",
  "referral_received",
  "review_completed",
  "qualified",
  "outreach_sent",
  "proposal_sent",
  "deal_lost",
];
