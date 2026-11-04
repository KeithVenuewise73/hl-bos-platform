import { CAPABILITIES, MODULES, resolveEntitlements } from "@hl-bos/tms";
import { db } from "@/lib/db.ts";
import { requireScreen } from "@/lib/guard.ts";
import { Card, PageTitle } from "@/components/ui.tsx";
import { BillingControls } from "@/components/BillingControls.tsx";

export const dynamic = "force-dynamic";

/** Workflow T-4 / H-1: what this company licenses, read from HL-BOS billing. */
export default async function Modules() {
  const ctx = await requireScreen("modules");
  const r = resolveEntitlements(ctx.company.licensed);
  const subs = await db()
    .rows<{ plan_key: string; status: string }>(
      ctx.user.id,
      "select plan_key, status::text from billing.subscriptions where tenant_id = $1 order by plan_key",
      [ctx.company.id],
    )
    .catch(() => []);
  const plans = await db().rows<{ key: string; name: string }>(
    ctx.user.id,
    "select key, name from billing.plans where product_key = 'transportation_os' and is_active order by name",
  );
  return (
    <div className="space-y-4">
      <PageTitle
        title="Modules and subscription"
        sub="Licences come from HL-BOS billing. This page reads them; it does not grant them."
      />
      <Card title="Subscriptions">
        {subs.length === 0 ? (
          <p className="text-sm text-muted">No subscription.</p>
        ) : (
          <ul data-testid="subscriptions" className="text-sm">
            {subs.map((s) => (
              <li key={s.plan_key} data-plan={s.plan_key} data-status={s.status}>
                <b>{s.plan_key}</b> — {s.status}
              </li>
            ))}
          </ul>
        )}
        <BillingControls plans={plans} />
      </Card>
      <Card title="Modules">
        <ul className="divide-y divide-line text-sm">
          {MODULES.map((m) => {
            const on = ctx.company.licensed.includes(m.key);
            return (
              <li
                key={m.key}
                data-module={m.key}
                data-licensed={on}
                className="flex items-start gap-3 py-2"
              >
                <span
                  className={`mt-0.5 w-20 text-xs font-semibold ${on ? "text-ok" : "text-muted"}`}
                >
                  {on ? "licensed" : "—"}
                </span>
                <div className="flex-1">
                  <b>
                    {m.number}. {m.name}
                  </b>{" "}
                  <span className="text-xs text-muted">Release {m.release}</span>
                  <div className="text-xs text-muted">{m.summary}</div>
                </div>
                <span className="whitespace-nowrap text-xs text-muted">
                  {m.ui === "MISSING" ? "not built" : "built"}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title="Included platform capabilities (not billed)">
        <ul data-testid="capabilities" className="grid gap-1 text-sm md:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <li
              key={c.key}
              data-cap={c.key}
              data-on={r.capabilities.includes(c.key)}
              className={
                r.capabilities.includes(c.key) ? "" : "text-muted line-through"
              }
            >
              {r.capabilities.includes(c.key) ? "✓" : "–"} {c.name}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
