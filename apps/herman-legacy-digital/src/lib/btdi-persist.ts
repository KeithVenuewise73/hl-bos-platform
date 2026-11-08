import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { BtdiRecord } from "./btdi";
import { deliverInquiry, submissionIdFrom } from "./delivery";

/**
 * BTDI persistence adapter. A valid submission ALWAYS produces a record; whether
 * it is stored depends on deploy-time configuration — NEVER a fabricated success
 * (Principle 10).
 *
 * Preferred path: the canonical Supabase RPC
 * `public.submit_business_transformation_intake(payload)`, called with the
 * PUBLISHABLE (anon) key only. The RPC is SECURITY DEFINER and the sole anon
 * write path — anon has no table access, cannot read submissions, and no
 * service-role key ever touches this code. Until migration 0031 is applied, the
 * RPC does not exist and we honestly report `persisted: false`.
 *
 * Fallback: the inquiry delivery destination (`HLD_INTAKE_WEBHOOK_URL`), used
 * when the RPC is not configured OR fails (e.g. migration 0031 not applied).
 * When neither stores it, we return `persisted: false` and the route tells the
 * visitor it was NOT received. Logs never carry the visitor's details.
 */
export interface PersistResult {
  persisted: boolean;
  ref?: string;
  reason?: string;
}

interface RpcPayload {
  sections: BtdiRecord["sections"];
  contact: BtdiRecord["contact"];
  summary: BtdiRecord["summary"];
  consent: BtdiRecord["consent"];
  attribution: Record<string, string>;
  source_page: string;
}

export async function persistBtdi(
  record: BtdiRecord,
  sourcePage: string,
): Promise<PersistResult> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

  const payload: RpcPayload = {
    sections: record.sections,
    contact: record.contact,
    summary: record.summary,
    consent: record.consent,
    attribution: record.attribution,
    source_page: sourcePage,
  };

  if (url && key) {
    try {
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const result = (await supabase.rpc("submit_business_transformation_intake", {
        payload,
      })) as { data: unknown; error: { message: string } | null };
      const { data, error } = result;
      if (!error) {
        return typeof data === "string"
          ? { persisted: true, ref: data }
          : { persisted: true };
      }
      // The RPC's own messages carry no visitor details (see migration 0031).
      console.info("[btdi] storage refused", { message: error.message.slice(0, 120) });
      // Its duplicate guard means this same intake was stored moments ago.
      if (/please wait/i.test(error.message)) return { persisted: true };
      // A refusal of the input itself is final; anything else (e.g. the
      // function does not exist yet) falls back to the delivery destination.
      if (/too large|required|invalid email/i.test(error.message)) {
        return { persisted: false, reason: error.message };
      }
    } catch {
      console.info("[btdi] storage request failed");
    }
  }

  const submissionId = submissionIdFrom(undefined);
  const delivery = await deliverInquiry(
    { schema: "hld.transformation_intake.v1", submissionId, ...payload },
    { url: process.env["HLD_INTAKE_WEBHOOK_URL"], submissionId },
  );
  if (delivery.delivered) return { persisted: true };

  console.info("[btdi] NOT stored", {
    submissionId,
    reason: delivery.reason,
    httpStatus: delivery.httpStatus ?? null,
  });
  return { persisted: false, reason: delivery.reason };
}
