import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { BtdiRecord } from "./btdi";

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
 * Fallback: an optional delivery webhook (`HLD_INTAKE_WEBHOOK_URL`). When
 * neither is available (dev/CI), the request is captured to the server log and
 * we return `persisted: false` — captured for human follow-up, never dropped.
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
      if (error) return { persisted: false, reason: error.message };
      return typeof data === "string"
        ? { persisted: true, ref: data }
        : { persisted: true };
    } catch {
      return { persisted: false, reason: "storage request failed" };
    }
  }

  const webhook = process.env["HLD_INTAKE_WEBHOOK_URL"];
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok)
        return { persisted: false, reason: `delivery returned ${res.status}` };
      return { persisted: true };
    } catch {
      return { persisted: false, reason: "delivery request failed" };
    }
  }

  // Honest no-op: captured for follow-up, not silently dropped. No PII beyond
  // what is needed to reconcile the request from logs.
  console.info("[btdi] intake captured (storage not configured):", {
    business: record.summary.businessName,
    email: record.contact.email,
    stage: record.summary.businessStage,
  });
  return { persisted: false, reason: "storage not configured" };
}
