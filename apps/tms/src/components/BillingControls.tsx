"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EVENTS = [
  ["checkout.session.completed", "Subscribe (checkout completed)"],
  ["invoice.payment_failed", "Payment failed"],
  ["invoice.paid", "Payment recovered"],
  ["customer.subscription.deleted", "Cancel subscription"],
] as const;

/**
 * Simulates Stripe TEST-MODE events, signed with this environment's own
 * secret and run through the real webhook handler. No money moves.
 */
export function BillingControls({ plans }: { plans: { key: string; name: string }[] }) {
  const router = useRouter();
  const [plan, setPlan] = useState(plans[0]?.key ?? "");
  const [msg, setMsg] = useState("");
  return (
    <div className="mt-3 rounded bg-wash p-3 text-sm">
      <div className="mb-2 text-xs text-muted">
        Simulated billing event (isolated environment — no Stripe account, no payment):
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="rounded border border-line px-2 py-1"
        >
          {plans.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        {EVENTS.map(([ev, label]) => (
          <button
            key={ev}
            data-event={ev}
            className="rounded border border-line bg-panel px-2 py-1"
            onClick={() =>
              void fetch("/api/demo", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ event: ev, plan }),
              }).then(async (r) => {
                const b = (await r.json()) as { outcome?: string; error?: string };
                setMsg(b.outcome ?? b.error ?? "");
                router.refresh();
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      {msg ? (
        <p data-testid="billing-outcome" className="mt-2 text-xs">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
