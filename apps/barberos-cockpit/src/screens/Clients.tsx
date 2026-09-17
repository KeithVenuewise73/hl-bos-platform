"use client";

import { myShops, type MyShop } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { Card, EmptyState } from "@/components/ui";
import { Loaded, PageHead } from "@/components/parts";

/**
 * Screen 10 — the shops we are actually running.
 *
 * barberos_my_shops() lists only tenants the signed-in operator has an active
 * membership of, so this is not "every client of the agency" — it is the ones
 * this account can work on. Said plainly, because the difference matters when
 * a number looks lower than expected.
 */
export default function Clients({
  onOpen,
  onOpenCrm,
}: {
  onOpen: (tenantId: string) => void;
  onOpenCrm: (tenantId: string) => void;
}) {
  const state = useAsync(() => myShops(), []);

  return (
    <>
      <PageHead
        title="Client shops"
        sub="Shops with their own tenant and shop record — the ones you are a member of. A shop somebody else operates will not appear here."
      />

      <Loaded
        state={state}
        isEmpty={(d: MyShop[]) => d.length === 0}
        empty={
          <EmptyState title="No client shops yet">
            A shop appears here once an accepted proposal has been onboarded. Nothing
            has been, or the ones that have belong to tenants you are not a member of.
          </EmptyState>
        }
      >
        {(shops) => (
          <div className="grid cols-2">
            {shops.map((s) => (
              <Card
                key={s.tenant_id}
                title={s.shop_name}
                action={
                  s.site ? (
                    <span
                      className={`badge ${s.site.status === "published" ? "ok" : "demo"}`}
                    >
                      page {s.site.status}
                    </span>
                  ) : (
                    <span className="badge warn">no page yet</span>
                  )
                }
              >
                <dl className="kv">
                  <dt>Tenant</dt>
                  <dd className="muted">{s.tenant_slug}</dd>
                  <dt>Chairs</dt>
                  <dd>{s.chair_count}</dd>
                  <dt>Timezone</dt>
                  <dd className="muted">{s.timezone}</dd>
                  <dt>Switched on</dt>
                  <dd>
                    {s.capabilities.length === 0 ? (
                      <span className="dim">nothing yet</span>
                    ) : (
                      s.capabilities.join(", ")
                    )}
                  </dd>
                </dl>
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn primary" onClick={() => onOpen(s.tenant_id)}>
                    Delivery
                  </button>
                  <button className="btn" onClick={() => onOpenCrm(s.tenant_id)}>
                    Clients &amp; retention
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Loaded>
    </>
  );
}
