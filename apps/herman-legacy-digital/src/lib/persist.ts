import "server-only";
import { deliverInquiry, type DeliveryResult } from "./delivery";
import type { InquiryEnvelope } from "./intake-handler";

/**
 * Inquiry delivery, server side. The destination is a deploy-time setting:
 * `HLD_INTAKE_WEBHOOK_URL` (any HTTPS endpoint that accepts a JSON POST and
 * answers 2xx once the inquiry is stored). When it is not set, nothing is
 * delivered and the visitor is told so — never a fabricated success. We never
 * use a service-role key here, and never write to Venuewise.
 */
export function deliverLead(envelope: InquiryEnvelope): Promise<DeliveryResult> {
  return deliverInquiry(envelope, {
    url: process.env["HLD_INTAKE_WEBHOOK_URL"],
    submissionId: envelope.submissionId,
  });
}
