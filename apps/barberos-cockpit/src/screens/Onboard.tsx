"use client";

import { useEffect, useState } from "react";

import { pipeline, provisionClient, type Agency } from "@/lib/api";
import { useAction, useAsync } from "@/lib/hooks";
import { slugify, when } from "@/lib/model";
import { Card, EmptyState, Field } from "@/components/ui";
import { Crumbs, Loaded, PageHead, Toast } from "@/components/parts";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

/**
 * Screen 9 — the sale becomes a client.
 *
 * One RPC does all of it: provision the shop's own tenant, create its
 * barberos.shops row, and link it back to the prospect. It refuses without an
 * accepted proposal, and refuses a prospect that was already onboarded — so
 * this screen cannot manufacture a customer that nobody bought, and cannot
 * produce two tenants for one shop.
 */
export default function Onboard({
  agency,
  prospectId,
  onBack,
  onDone,
}: {
  agency: Agency;
  prospectId: string;
  onBack: () => void;
  onDone: (tenantId: string) => void;
}) {
  const pipe = useAsync(() => pipeline(agency.tenant_id), [agency.tenant_id]);
  const act = useAction();
  const entry = pipe.data?.find((e) => e.prospect_id === prospectId) ?? null;

  const [shopName, setShopName] = useState("");
  const [slug, setSlug] = useState("");
  const [chairs, setChairs] = useState(1);
  const [tz, setTz] = useState("America/New_York");
  const [touchedSlug, setTouchedSlug] = useState(false);

  useEffect(() => {
    if (!entry || shopName) return;
    setShopName(entry.business_name);
    if (!touchedSlug) setSlug(slugify(entry.business_name));
  }, [entry, shopName, touchedSlug]);

  const sold = entry?.latest_proposal?.status === "accepted";
  const already = entry?.onboarding ?? null;

  function go() {
    let tenant = "";
    act.run(
      "Client onboarded.",
      () =>
        provisionClient({
          prospect: prospectId,
          slug: slug.trim(),
          shopName: shopName.trim(),
          chairs,
          timezone: tz,
        }).then((v) => (tenant = v)),
      () => {
        if (tenant) onDone(tenant);
      },
    );
  }

  return (
    <>
      <Crumbs trail={[{ label: "Back", go: onBack }, { label: "Onboard" }]} />

      <Loaded
        state={pipe}
        isEmpty={() => entry === null}
        empty={<EmptyState title="That shop is not in this agency's pipeline" />}
      >
        {() => {
          if (!entry) return null;
          if (already) {
            return (
              <>
                <PageHead title={entry.business_name} sub="Already a client." />
                <Card title="Onboarded">
                  <dl className="kv">
                    <dt>Onboarded</dt>
                    <dd>{when(already.onboarded_at)}</dd>
                    <dt>Shop record</dt>
                    <dd>{already.shop_name ?? "exists, but you cannot read it"}</dd>
                  </dl>
                  {already.client_tenant_id ? (
                    <button
                      className="btn primary"
                      style={{ marginTop: 12 }}
                      onClick={() => onDone(already.client_tenant_id!)}
                    >
                      Open the shop →
                    </button>
                  ) : (
                    <div className="banner" style={{ marginTop: 12 }}>
                      This shop has its own tenant, and you are not a member of it — so
                      the cockpit will not hand you its id. Someone with access to that
                      tenant can open it.
                    </div>
                  )}
                </Card>
              </>
            );
          }

          if (!sold) {
            return (
              <>
                <PageHead title={entry.business_name} sub="Not sold yet." />
                <EmptyState title="There is no accepted proposal for this shop">
                  A client is onboarded after a sale, not before it. The database
                  refuses to create a customer tenant for a shop that has not accepted a
                  proposal — so this form is not shown, rather than shown and refused.
                  {entry.latest_proposal
                    ? ` The latest proposal is ${entry.latest_proposal.status}.`
                    : " No proposal has been drafted."}
                </EmptyState>
              </>
            );
          }

          if (!agency.can.onboard_clients) {
            return (
              <>
                <PageHead title={entry.business_name} sub="Sold." />
                <EmptyState title="You cannot onboard a client">
                  Onboarding creates a new tenant, which needs the platform-wide
                  platform.tenant.create permission as well as this agency&rsquo;s
                  transform_audit.proposal.manage. Your account has the second but not
                  the first.
                </EmptyState>
              </>
            );
          }

          return (
            <>
              <PageHead
                title={`Onboard ${entry.business_name}`}
                sub={`Accepted on ${when(entry.latest_proposal?.decided_at)}. This creates the shop's own tenant, makes you its owner, and creates the shop record the capabilities hang off.`}
              />
              <Card title="The new client">
                <div className="grid cols-2">
                  <Field label="Shop name">
                    <input
                      type="text"
                      value={shopName}
                      onChange={(e) => {
                        setShopName(e.target.value);
                        if (!touchedSlug) setSlug(slugify(e.target.value));
                      }}
                    />
                  </Field>
                  <Field label="Tenant slug — must be unique across the platform">
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => {
                        setTouchedSlug(true);
                        setSlug(e.target.value);
                      }}
                    />
                  </Field>
                  <Field label="Chairs">
                    <input
                      type="number"
                      min={1}
                      value={chairs}
                      onChange={(e) =>
                        setChairs(Math.max(1, Number(e.target.value) || 1))
                      }
                    />
                  </Field>
                  <Field label="Timezone">
                    <select value={tz} onChange={(e) => setTz(e.target.value)}>
                      {TIMEZONES.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="banner">
                  This happens once. There is no undo in this console: a second attempt
                  would mean a second tenant for the same shop, and the database refuses
                  it.
                </div>
                <div className="row" style={{ marginTop: 14 }}>
                  <button
                    className="btn primary"
                    disabled={act.busy || !shopName.trim() || !slug.trim()}
                    onClick={go}
                  >
                    {act.busy ? "Onboarding…" : "Onboard this client"}
                  </button>
                  <button className="btn" onClick={onBack}>
                    Not yet
                  </button>
                </div>
              </Card>
            </>
          );
        }}
      </Loaded>

      <Toast notice={act.notice} onClose={act.clear} />
    </>
  );
}
