// The canonical HLG Revenue Center workflow, persisted in the EXISTING HL-BOS
// schemas. It adds no table and no migration.
//
//   discovered  -> visibility.create_prospect      (in the HLD or HSCS tenant)
//   Send to Review -> visibility.start_assessment
//   assessment  -> visibility.score_category       (only components the scanner checked)
//   findings    -> visibility.add_recommendation   (weaknesses + services, with evidence)
//              -> visibility.complete_assessment   (refuses if nothing was scored)
//   proposal    -> visibility.draft_content(kind 'proposal')
//   approval    -> visibility.submit_content_for_approval -> workflows.decide
//   outreach    -> comms.request_message(marketing, require_approval)  (DB refuses without consent)
//              -> workflows.decide -> comms.approve_message   => status 'approved' (queued)
//
// Nothing here sends. Delivery is recorded only by the trusted provider worker
// (comms.record_delivery, platform admin only), which this module never calls.
//
// Each business line is its own HL-BOS tenant, so the database's row-level
// security keeps HLD and HSCS records apart: the same rule PR #115's
// LineScopedStore enforces in memory.
//
// Storage is reached through `HlbosRpc`, whose two methods map one-to-one onto
// supabase-js (`schema(s).rpc(fn, args)` and `schema(s).from(t).select().match()`)
// and onto a local psql adapter used by the persistence tests.

import type { Prospect } from "@hl-bos/presence-scanner";

import { buildProposal, type PriceBook, type Proposal } from "./proposal.ts";
import {
  buildReview,
  validateReview,
  type OpportunityReview,
  type ReviewOptions,
} from "./review.ts";
import { routePresenceLead } from "./from-presence.ts";
import { lineName, routeLead, type Campaign, type RoutingResult } from "./routing.ts";
import type { BusinessLine } from "./types.ts";

export interface HlbosRpc {
  /** Call `schema.fn` with named arguments, as the given user. Returns the function's result. */
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

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export type PersistResult =
  | {
      status: "persisted";
      prospectId: string;
      line: BusinessLine;
      tenantId: string;
      routing: RoutingResult;
    }
  | { status: "needs_review"; routing: RoutingResult };

export interface AssessmentResult {
  assessmentId: string;
  growthScore: number;
  categoriesScored: string[];
  recommendationIds: number[];
  review: OpportunityReview;
}

export interface ProposalDraftResult {
  contentId: string;
  proposal: Proposal;
  /** Set only when the proposal was complete enough to ask the owner. */
  approvalInstanceId: string | undefined;
}

export interface OutreachResult {
  messageId: string;
  approvalInstanceId: string;
}

export class RevenueCenter {
  constructor(
    private readonly rpc: HlbosRpc,
    private readonly tenants: LineTenants,
    private readonly campaigns: readonly Campaign[] = [],
  ) {}

  private lineOfTenant(tenantId: string): BusinessLine {
    if (tenantId === this.tenants.hld) return "hld";
    if (tenantId === this.tenants.hscs) return "hscs";
    throw new WorkflowError(`Tenant ${tenantId} is not an HLG business line.`);
  }

  /**
   * Step 1-2: route the discovered lead to a business line and persist it in
   * that line's tenant. A lead whose line is uncertain is NOT persisted into
   * either line; it is returned for a person to decide.
   */
  async persistDiscovered(
    actor: string,
    lead: Prospect,
    campaignKey?: string,
  ): Promise<PersistResult> {
    const routed = campaignKey
      ? {
          prospect: lead,
          routing: routeLead(
            {
              origin: "discovered",
              campaignKey,
              inboundSite: undefined,
              vertical: lead.vertical,
              industry: lead.places?.record.primaryTypeLabel,
            },
            this.campaigns,
          ),
        }
      : routePresenceLead(lead, this.campaigns);
    if (routed.routing.status !== "routed")
      return { status: "needs_review", routing: routed.routing };
    const line = routed.routing.line;
    const tenantId = this.tenants[line];
    const prospectId = await this.rpc.call<string>(
      actor,
      "visibility.create_prospect",
      {
        p_tenant: tenantId,
        p_business: lead.name,
        p_email: lead.corrections.email ?? lead.email ?? null,
        p_phone: lead.corrections.phone ?? lead.phone ?? null,
        p_industry: lead.places?.record.primaryTypeLabel ?? lead.vertical,
        p_city: lead.market.label,
        p_website: lead.corrections.website ?? lead.website ?? null,
      },
    );
    return { status: "persisted", prospectId, line, tenantId, routing: routed.routing };
  }

  /**
   * Steps 3-5: Send to Review. Runs the deterministic assessment from the
   * scanner's evidence and stores scores and findings. Refuses a review that
   * fails PR #115's honesty validator, and refuses a second open review.
   */
  async sendToReview(
    actor: string,
    prospectId: string,
    lead: Prospect,
    opts: Omit<ReviewOptions, "line"> = { now: new Date() },
  ): Promise<AssessmentResult> {
    const [prospect] = await this.rpc.rows<{ tenant_id: string }>(
      actor,
      "visibility.prospects",
      { id: prospectId },
    );
    if (!prospect)
      throw new WorkflowError("Prospect not found, or not visible to you.");
    const line = this.lineOfTenant(prospect.tenant_id);
    const open = await this.rpc.rows(actor, "visibility.assessments", {
      prospect_id: prospectId,
      status: "draft",
    });
    if (open.length > 0)
      throw new WorkflowError("This prospect already has a review in progress.");

    // complete_assessment refuses an assessment with nothing scored. Check first,
    // so a lead with no evidence never leaves a half-started review behind.
    if (!lead.score.components.some((c) => c.status !== "not_checked" && c.max > 0))
      throw new WorkflowError(
        "Nothing about this business could be checked, so there is nothing to review yet.",
      );
    const review = buildReview(lead, { ...opts, line });
    const problems = validateReview(review);
    if (problems.length > 0)
      throw new WorkflowError(`Review refused: ${problems.join(" ")}`);

    const assessmentId = await this.rpc.call<string>(
      actor,
      "visibility.start_assessment",
      {
        p_prospect: prospectId,
      },
    );
    const categoriesScored: string[] = [];
    for (const c of lead.score.components) {
      if (c.status === "not_checked" || c.max === 0) continue; // unchecked is never scored
      const category = COMPONENT_TO_CATEGORY[c.component];
      // Scanner points measure the GAP; the HL-BOS 0-5 score measures QUALITY.
      const score = Math.round(5 * (1 - c.awarded / c.max));
      await this.rpc.call(actor, "visibility.score_category", {
        p_assessment: assessmentId,
        p_category: category,
        p_score: score,
        p_note:
          `${c.label}: ${c.awarded}/${c.max} gap points (${lead.score.version}). ${c.note}`.trim(),
      });
      categoriesScored.push(category);
    }

    const recommendationIds: number[] = [];
    for (const f of review.observed.filter((x) => x.status !== "present")) {
      recommendationIds.push(
        await this.rpc.call<number>(actor, "visibility.add_recommendation", {
          p_assessment: assessmentId,
          p_kind: "weakness",
          p_title: f.label,
          p_detail: `OBSERVED (${f.source}, ${f.observedAt.slice(0, 10)}, ${f.confidence} confidence): ${f.evidence}`,
          p_priority: 3,
        }),
      );
    }
    const rank = { critical: 1, high: 2, medium: 3, low: 4 } as const;
    for (const o of review.opportunities) {
      recommendationIds.push(
        await this.rpc.call<number>(actor, "visibility.add_recommendation", {
          p_assessment: assessmentId,
          p_kind: "service",
          p_title: o.offerName,
          p_detail: `ESTIMATED OPPORTUNITY, not a measured result. ${o.rationale} Based on: ${o.basedOn.join(", ")}.`,
          p_service: o.offerKey,
          p_priority: rank[o.priority],
        }),
      );
    }
    const growthScore = await this.rpc.call<number>(
      actor,
      "visibility.complete_assessment",
      {
        p_assessment: assessmentId,
      },
    );
    return { assessmentId, growthScore, categoriesScored, recommendationIds, review };
  }

  /**
   * Steps 6-8: draft the proposal in the prospect's own line, store it, and ask
   * the owner — but only when the proposal is complete (priced, honest). A
   * blocked proposal is stored as a draft with its reasons and goes no further.
   */
  async draftProposal(
    actor: string,
    prospectId: string,
    review: OpportunityReview,
    priceBook?: PriceBook,
  ): Promise<ProposalDraftResult> {
    const [prospect] = await this.rpc.rows<{
      tenant_id: string;
      business_name: string;
    }>(actor, "visibility.prospects", { id: prospectId });
    if (!prospect)
      throw new WorkflowError("Prospect not found, or not visible to you.");
    const line = this.lineOfTenant(prospect.tenant_id);
    if (review.line !== line)
      throw new WorkflowError(
        `The review is for ${lineName(review.line)} but the prospect belongs to ${lineName(line)}.`,
      );
    const proposal = buildProposal(review, priceBook ? { priceBook } : {});
    const contentId = await this.rpc.call<string>(actor, "visibility.draft_content", {
      p_tenant: prospect.tenant_id,
      p_site: null,
      p_kind: "proposal",
      p_title: `Proposal — ${prospect.business_name} (${lineName(line)})`,
      p_body: JSON.stringify({ prospectId, proposal }),
    });
    if (proposal.status !== "ready_for_approval")
      return { contentId, proposal, approvalInstanceId: undefined };
    const approvalInstanceId = await this.rpc.call<string>(
      actor,
      "visibility.submit_content_for_approval",
      {
        p_content: contentId,
      },
    );
    await this.rpc.call(actor, "visibility.set_prospect_stage", {
      p_prospect: prospectId,
      p_stage: "proposed",
    });
    return { contentId, proposal, approvalInstanceId };
  }

  /** The owner's decision on any pending approval (proposal or outreach). */
  async decide(
    actor: string,
    approvalInstanceId: string,
    decision: "approved" | "rejected",
    reason?: string,
  ): Promise<void> {
    const [task] = await this.rpc.rows<{ id: string; status: string }>(
      actor,
      "workflows.tasks",
      {
        instance_id: approvalInstanceId,
      },
    );
    if (!task) throw new WorkflowError("Approval not found, or not visible to you.");
    await this.rpc.call(actor, "workflows.decide", {
      p_task: task.id,
      p_decision: decision,
      p_reason: reason ?? null,
    });
  }

  /**
   * Step 9: queue authorised outreach. Only after the proposal is approved;
   * the database itself refuses marketing without consent and records the
   * message as pending its own approval. Nothing is sent.
   */
  async requestOutreach(
    actor: string,
    contentId: string,
    to: string,
    vars: { business: string; contact: string; link: string },
  ): Promise<OutreachResult> {
    const [content] = await this.rpc.rows<{
      tenant_id: string;
      status: string;
      approval_instance_id: string | null;
    }>(actor, "visibility.content_assets", { id: contentId });
    if (!content) throw new WorkflowError("Proposal not found, or not visible to you.");
    const approved =
      content.approval_instance_id !== null &&
      (await this.rpc.call<boolean>(actor, "workflows.is_approved", {
        p_instance: content.approval_instance_id,
      }));
    if (!approved)
      throw new WorkflowError("The proposal has not been approved by the owner.");
    const messageId = await this.rpc.call<string>(actor, "comms.request_message", {
      p_tenant: content.tenant_id,
      p_module: "revenue_center",
      p_channel: "email",
      p_template: "proposal_delivery",
      p_version: 1,
      p_to: to,
      p_class: "marketing",
      p_vars: JSON.stringify(vars),
      p_idempotency: `proposal:${contentId}:${to}`,
      p_require_approval: true,
    });
    const [msg] = await this.rpc.rows<{
      approval_instance_id: string | null;
      status: string;
    }>(actor, "comms.messages", {
      id: messageId,
    });
    if (!msg?.approval_instance_id)
      throw new WorkflowError(
        `Outreach was not held for approval (status ${msg?.status ?? "unknown"}).`,
      );
    return { messageId, approvalInstanceId: msg.approval_instance_id };
  }

  /** After the owner approves the message: mark it approved (queued for the provider). */
  async releaseOutreach(actor: string, messageId: string): Promise<void> {
    await this.rpc.call(actor, "comms.approve_message", { p_message: messageId });
  }
}
