// Approval gate for anything that leaves HLG or costs money.
//
// An external action is represented as a request. `execute` refuses to run the
// action's effect unless an approval from the owner, for exactly this request
// (same id and same content hash), is presented. Changing the content after
// approval invalidates the approval — what was approved is what goes out.

import { createHash } from "node:crypto";

import type { Principal } from "./isolation.ts";
import type { BusinessLine } from "./types.ts";

export type ExternalActionKind =
  | "send_outreach"
  | "send_proposal"
  | "publish_content"
  | "change_business_profile"
  | "reply_to_review"
  | "change_campaign"
  | "increase_budget"
  | "deploy_software";

export interface ActionRequest {
  id: string;
  kind: ExternalActionKind;
  line: BusinessLine;
  /** The exact content or change, as it will be sent or applied. */
  payload: unknown;
  requestedBy: string;
  requestedAt: string;
  /** Outreach only: the recipient's consent record id. Required for send_outreach. */
  consentRef?: string;
}

export interface Approval {
  requestId: string;
  contentHash: string;
  approvedBy: string;
  approvedAt: string;
}

export function contentHash(r: ActionRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({ id: r.id, kind: r.kind, line: r.line, payload: r.payload }),
    )
    .digest("hex");
}

export class ApprovalRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalRequiredError";
  }
}

/** Only the owner approves external actions. */
export function approve(r: ActionRequest, by: Principal, now: Date): Approval {
  if (by.role !== "owner")
    throw new ApprovalRequiredError(
      "Only the owner can approve something that leaves HLG.",
    );
  if (r.kind === "send_outreach" && !r.consentRef)
    throw new ApprovalRequiredError(
      "Outreach needs a lawful basis on record (consent or a permitted business contact) before it can be approved.",
    );
  return {
    requestId: r.id,
    contentHash: contentHash(r),
    approvedBy: by.id,
    approvedAt: now.toISOString(),
  };
}

/**
 * Run `effect` only with a matching approval. Returns what the effect returns.
 * The effect is the ONLY place a send/publish/apply may happen.
 */
export async function execute<T>(
  r: ActionRequest,
  approval: Approval | undefined,
  effect: (r: ActionRequest) => Promise<T>,
): Promise<T> {
  if (!approval) throw new ApprovalRequiredError(`"${r.kind}" has not been approved.`);
  if (approval.requestId !== r.id)
    throw new ApprovalRequiredError("This approval is for a different request.");
  if (approval.contentHash !== contentHash(r))
    throw new ApprovalRequiredError(
      "The content changed after it was approved; approve it again.",
    );
  return effect(r);
}
