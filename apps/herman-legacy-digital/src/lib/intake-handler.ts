/**
 * The Contact / Book / Visibility Assessment front door, as a pure function so
 * every outcome is tested: validate → deliver → answer the visitor honestly.
 *
 * - Valid and delivered      → 200 `received` with a reference.
 * - Valid, NOT delivered     → 503 `not_delivered`. The visitor is told plainly
 *   that the request was not sent and can retry (same submission id).
 * - Invalid                  → 422 `invalid`; nothing is sent.
 *
 * Logs carry the submission id, request type and failure reason only — never
 * the visitor's name, email, phone, business or message.
 */
import {
  validateIntake,
  nextStepFor,
  referenceFor,
  type IntakeInput,
  type IntakeKind,
  type LeadRecord,
} from "./intake";
import { submissionIdFrom, type DeliveryResult } from "./delivery";

export const NOT_DELIVERED_MESSAGE =
  "We could not send your request just now, so it has not been received. Your answers are still on this page; please try again in a few minutes.";

export type IntakeResponse =
  | { status: "received"; ref: string; nextStep: string }
  | { status: "not_delivered"; message: string }
  | { status: "invalid"; errors: string[] };

/** What reaches the destination: the lead plus delivery metadata. */
export interface InquiryEnvelope extends LeadRecord {
  schema: "hld.inquiry.v1";
  submissionId: string;
  ref: string;
  submittedAt: string;
}

export type Deliver = (envelope: InquiryEnvelope) => Promise<DeliveryResult>;
export type Log = (message: string, fields: Record<string, unknown>) => void;

export async function handleIntake(
  body: unknown,
  deliver: Deliver,
  log: Log,
  now: () => Date = () => new Date(),
): Promise<{ httpStatus: number; json: IntakeResponse }> {
  const input = (body ?? {}) as IntakeInput & { submissionId?: unknown };
  const result = validateIntake(input);
  if (!result.ok || !result.lead) {
    return { httpStatus: 422, json: { status: "invalid", errors: result.errors } };
  }

  const submissionId = submissionIdFrom(input.submissionId);
  const ref = referenceFor(result.lead);
  const envelope: InquiryEnvelope = {
    schema: "hld.inquiry.v1",
    submissionId,
    ref,
    submittedAt: now().toISOString(),
    ...result.lead,
  };

  const delivery = await deliver(envelope);
  const kind: IntakeKind = result.lead.kind;
  if (delivery.delivered) {
    log("[intake] delivered", { submissionId, kind, attempts: delivery.attempts });
    return {
      httpStatus: 200,
      json: { status: "received", ref, nextStep: nextStepFor(kind) },
    };
  }

  log("[intake] NOT delivered", {
    submissionId,
    kind,
    reason: delivery.reason,
    httpStatus: delivery.httpStatus ?? null,
    attempts: delivery.attempts,
  });
  return {
    httpStatus: 503,
    json: { status: "not_delivered", message: NOT_DELIVERED_MESSAGE },
  };
}
