import "server-only";
import type { LeadRecord } from "./intake";

/**
 * Lead persistence adapter. A valid intake ALWAYS produces a lead record; whether
 * it is delivered into the customer lifecycle depends on a deploy-time
 * configuration — NEVER a fabricated success.
 *
 * The delivery path is a single, secretless-friendly integration point:
 * `HLD_INTAKE_WEBHOOK_URL` (e.g. a queue / automation endpoint that writes into
 * the canonical HL-BOS CRM via the platform's own RLS-safe path). When it is not
 * configured (as in dev/CI), we honestly report `persisted: false` — the request
 * is still captured (server log) and a human advisor follows up. We never use a
 * service-role key here, and never write to Venuewise.
 */
export async function persistLead(
  lead: LeadRecord,
): Promise<{ persisted: boolean; reason?: string }> {
  const webhook = process.env["HLD_INTAKE_WEBHOOK_URL"];
  if (!webhook) {
    // Honest no-op delivery: captured for follow-up, not silently dropped.
    console.info("[intake] lead captured (delivery endpoint not configured):", {
      kind: lead.kind,
      org: lead.organization.name,
      email: lead.contact.email,
    });
    return { persisted: false, reason: "delivery endpoint not configured" };
  }
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lead),
    });
    if (!res.ok) return { persisted: false, reason: `delivery returned ${res.status}` };
    return { persisted: true };
  } catch {
    return { persisted: false, reason: "delivery request failed" };
  }
}
