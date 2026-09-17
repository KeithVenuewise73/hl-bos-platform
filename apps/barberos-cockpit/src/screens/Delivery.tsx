"use client";

import { useEffect, useState } from "react";

import {
  applyBundle,
  capabilityState,
  catalog,
  disableCapability,
  enableCapability,
  myShops,
  publish,
  saveService,
  saveSite,
  setHours,
  site,
  unpublish,
  deleteService,
  type Catalog,
} from "@/lib/api";
import { useAction, useAsync } from "@/lib/hooks";
import { WEEKDAYS, bundleStatus, money, when } from "@/lib/model";
import { Card, EmptyState, Field } from "@/components/ui";
import {
  CapabilityGate,
  CapabilityRow,
  Crumbs,
  Loaded,
  PageHead,
  Toast,
} from "@/components/parts";

const TABS = ["capabilities", "page", "hours", "services"] as const;
type Tab = (typeof TABS)[number];

/**
 * Screen 11 — transformation delivery.
 *
 * What we actually switch on for a paying shop, and the one shipped capability
 * with a surface: the page they own. Two things are visible here that the
 * platform would otherwise hide:
 *
 *   * Only client_crm and owned_website have shipped. Every other capability
 *     shows its blocker and who owns clearing it.
 *   * No bundle can be applied today, because apply_bundle() is all-or-nothing
 *     and every seeded bundle contains something unbuilt. The control is
 *     disabled with the reason beside it, not offered and then refused.
 */
export default function Delivery({
  tenantId,
  onBack,
  onOpenCrm,
}: {
  tenantId: string;
  onBack: () => void;
  onOpenCrm: () => void;
}) {
  const shops = useAsync(() => myShops(), []);
  const cat = useAsync(() => catalog(), []);
  const state = useAsync(() => capabilityState(tenantId), [tenantId]);
  const pg = useAsync(() => site(tenantId), [tenantId]);
  const act = useAction();
  const [tab, setTab] = useState<Tab>("capabilities");

  const shop = shops.data?.find((s) => s.tenant_id === tenantId) ?? null;

  const [f, setF] = useState({
    slug: "",
    headline: "",
    about: "",
    phone: "",
    address: "",
    locality: "",
    region: "",
    postal: "",
    mapUrl: "",
    bookingUrl: "",
  });
  const [seeded, setSeeded] = useState(false);
  const [svcName, setSvcName] = useState("");
  const [svcPrice, setSvcPrice] = useState("");
  const [svcMins, setSvcMins] = useState("");

  useEffect(() => {
    if (seeded || pg.loading) return;
    const p = pg.data;
    setF({
      slug: p?.slug ?? "",
      headline: p?.headline ?? "",
      about: p?.about ?? "",
      phone: p?.phone ?? "",
      address: p?.address_line1 ?? "",
      locality: p?.locality ?? "",
      region: p?.region ?? "",
      postal: p?.postal_code ?? "",
      mapUrl: p?.map_url ?? "",
      bookingUrl: p?.booking_url ?? "",
    });
    setSeeded(true);
  }, [pg.data, pg.loading, seeded]);

  function reload() {
    state.reload();
    shops.reload();
  }

  const enabledKeys = new Set(
    (state.data ?? []).map((e) => e.capability_key.toLowerCase()),
  );
  const siteOn = enabledKeys.has("owned_website");

  // The page, hours and services tabs all write to tables the owned_website
  // trigger guards, so with the capability off they are forms that cannot be
  // submitted. This is shown in their place.
  const websiteGate = (
    <CapabilityGate
      capability="owned_website"
      name="Owned Website"
      what="The page, its opening hours and its service list all live in tables that refuse a write until this capability is enabled for the shop."
      canEnable={shop?.can.manage_shop ?? false}
      busy={act.busy}
      onEnable={() =>
        act.run(
          "Owned Website switched on.",
          () => enableCapability(tenantId, "owned_website"),
          reload,
        )
      }
    />
  );

  return (
    <>
      <Crumbs
        trail={[
          { label: "Client shops", go: onBack },
          { label: shop?.shop_name ?? "Shop" },
        ]}
      />

      <Loaded
        state={shops}
        isEmpty={() => shop === null}
        empty={
          <EmptyState title="You are not a member of that shop's tenant">
            Every BarberOS call re-checks its own permission, so the cockpit cannot show
            you a shop you do not have access to.
          </EmptyState>
        }
      >
        {() => {
          if (!shop) return null;
          return (
            <>
              <PageHead
                title={shop.shop_name}
                sub={`${shop.chair_count} chair${shop.chair_count === 1 ? "" : "s"} · ${shop.timezone} · tenant ${shop.tenant_slug}`}
                action={
                  <button className="btn" onClick={onOpenCrm}>
                    Clients &amp; retention →
                  </button>
                }
              />

              <div className="tabs">
                {TABS.map((t) => (
                  <button
                    key={t}
                    className={`tab${tab === t ? " active" : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "page" ? "Their page" : t[0]!.toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {tab === "capabilities" && (
                <Loaded
                  state={cat}
                  empty={<EmptyState title="The catalog could not be read" />}
                >
                  {(c: Catalog) => (
                    <>
                      <div className="banner" style={{ marginBottom: 16 }}>
                        {c.capabilities.filter((x) => x.status === "available").length}{" "}
                        of {c.capabilities.length} capabilities have shipped and can
                        actually be switched on. The rest are listed with what is
                        blocking them, because a greyed-out switch with no reason beside
                        it tells an operator nothing.
                      </div>

                      <Card title="Bundles">
                        <div className="list">
                          {c.bundles.map((b) => {
                            const v = bundleStatus(b);
                            return (
                              <div className="li" key={b.key}>
                                <div>
                                  <div style={{ fontWeight: 600 }}>{b.name}</div>
                                  <div className="muted" style={{ fontSize: 12.5 }}>
                                    {b.description}
                                  </div>
                                  {v.kind === "blocked" && (
                                    <div className="blk" style={{ fontSize: 12 }}>
                                      {v.note}
                                    </div>
                                  )}
                                </div>
                                <button
                                  className="btn sm primary"
                                  disabled={act.busy || v.kind === "blocked"}
                                  title={v.kind === "blocked" ? v.note : undefined}
                                  onClick={() =>
                                    act.run(
                                      `Applied the ${b.name} bundle.`,
                                      () => applyBundle(tenantId, b.key),
                                      reload,
                                    )
                                  }
                                >
                                  Apply
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </Card>

                      <h3 className="section-title" style={{ marginTop: 22 }}>
                        Capabilities
                      </h3>
                      <div className="list">
                        {c.capabilities.map((cp) => (
                          <CapabilityRow
                            key={cp.key}
                            capability={cp}
                            enabled={enabledKeys.has(cp.key.toLowerCase())}
                            enabledState={state.data ?? []}
                            busy={act.busy}
                            onToggle={
                              // The shop-manage permission is the closest proxy
                              // the my_shops read gives us for capability.manage;
                              // the RPC re-checks the real one and refuses if it
                              // is absent, and the refusal is shown verbatim.
                              shop.can.manage_shop
                                ? (on) =>
                                    act.run(
                                      on
                                        ? `${cp.name} switched on.`
                                        : `${cp.name} switched off.`,
                                      () =>
                                        on
                                          ? enableCapability(tenantId, cp.key)
                                          : disableCapability(tenantId, cp.key),
                                      reload,
                                    )
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    </>
                  )}
                </Loaded>
              )}

              {tab === "page" && (
                <>
                  {!siteOn ? (
                    websiteGate
                  ) : !shop.can.edit_page ? (
                    <EmptyState title="You cannot edit this shop's page">
                      Your membership of this tenant does not carry
                      barberos.site.update.
                    </EmptyState>
                  ) : (
                    <Card
                      title="The page they own"
                      action={
                        pg.data ? (
                          <span
                            className={`badge ${pg.data.status === "published" ? "ok" : "demo"}`}
                          >
                            {pg.data.status}
                            {pg.data.published_at
                              ? ` · ${when(pg.data.published_at)}`
                              : ""}
                          </span>
                        ) : (
                          <span className="badge warn">not created</span>
                        )
                      }
                    >
                      <div className="grid cols-2">
                        <Field label="Slug — the address of their page">
                          <input
                            type="text"
                            value={f.slug}
                            onChange={(e) => setF({ ...f, slug: e.target.value })}
                          />
                        </Field>
                        <Field label="Headline (required to publish)">
                          <input
                            type="text"
                            value={f.headline}
                            onChange={(e) => setF({ ...f, headline: e.target.value })}
                          />
                        </Field>
                        <Field label="Phone (required to publish, unless a booking link is set)">
                          <input
                            type="tel"
                            value={f.phone}
                            onChange={(e) => setF({ ...f, phone: e.target.value })}
                          />
                        </Field>
                        <Field label="Booking link">
                          <input
                            type="url"
                            value={f.bookingUrl}
                            onChange={(e) => setF({ ...f, bookingUrl: e.target.value })}
                          />
                        </Field>
                        <Field label="Street (required to publish)">
                          <input
                            type="text"
                            value={f.address}
                            onChange={(e) => setF({ ...f, address: e.target.value })}
                          />
                        </Field>
                        <Field label="Town">
                          <input
                            type="text"
                            value={f.locality}
                            onChange={(e) => setF({ ...f, locality: e.target.value })}
                          />
                        </Field>
                        <Field label="State / region">
                          <input
                            type="text"
                            value={f.region}
                            onChange={(e) => setF({ ...f, region: e.target.value })}
                          />
                        </Field>
                        <Field label="Postcode">
                          <input
                            type="text"
                            value={f.postal}
                            onChange={(e) => setF({ ...f, postal: e.target.value })}
                          />
                        </Field>
                        <Field label="Map link">
                          <input
                            type="url"
                            value={f.mapUrl}
                            onChange={(e) => setF({ ...f, mapUrl: e.target.value })}
                          />
                        </Field>
                      </div>
                      <Field label="About">
                        <textarea
                          value={f.about}
                          onChange={(e) => setF({ ...f, about: e.target.value })}
                        />
                      </Field>

                      <div className="banner">
                        Publishing is refused unless the page has a headline, a street
                        address, a phone number or booking link, and at least one row of
                        opening hours. That check is in the database, so the refusal
                        names whichever one is missing.
                      </div>

                      <div className="row" style={{ marginTop: 14 }}>
                        <button
                          className="btn primary"
                          disabled={act.busy || !f.slug.trim()}
                          onClick={() =>
                            act.run(
                              "Page saved.",
                              () => saveSite({ tenant: tenantId, ...f }),
                              () => {
                                pg.reload();
                                shops.reload();
                              },
                            )
                          }
                        >
                          Save the page
                        </button>
                        {shop.can.publish &&
                          (pg.data?.status === "published" ? (
                            <button
                              className="btn"
                              disabled={act.busy}
                              onClick={() =>
                                act.run(
                                  "Page unpublished.",
                                  () => unpublish(tenantId),
                                  () => {
                                    pg.reload();
                                    shops.reload();
                                  },
                                )
                              }
                            >
                              Unpublish
                            </button>
                          ) : (
                            <button
                              className="btn"
                              disabled={act.busy}
                              onClick={() =>
                                act.run(
                                  "Page published.",
                                  () => publish(tenantId),
                                  () => {
                                    pg.reload();
                                    shops.reload();
                                  },
                                )
                              }
                            >
                              Publish
                            </button>
                          ))}
                      </div>
                    </Card>
                  )}
                </>
              )}

              {tab === "hours" && !siteOn && websiteGate}
              {tab === "hours" && siteOn && (
                <Card title="Opening hours">
                  <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                    At least one row is required before the page can be published. A
                    closed day counts as a row — a blank week does not.
                  </p>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Opens</th>
                        <th>Closes</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {WEEKDAYS.map((name, day) => {
                        const row = pg.data?.hours.find((h) => h.day === day);
                        return (
                          <HoursRow
                            key={day}
                            day={day}
                            name={name}
                            closed={row?.closed ?? true}
                            opens={row?.opens ?? ""}
                            closes={row?.closes ?? ""}
                            disabled={act.busy || !shop.can.edit_page}
                            onSave={(closed, opens, closes) =>
                              act.run(
                                `${name} saved.`,
                                () =>
                                  setHours({
                                    tenant: tenantId,
                                    day,
                                    closed,
                                    opens: closed ? null : opens || null,
                                    closes: closed ? null : closes || null,
                                  }),
                                () => pg.reload(),
                              )
                            }
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              )}

              {tab === "services" && !siteOn && websiteGate}
              {tab === "services" && siteOn && (
                <Card title="Services and prices">
                  {pg.data && pg.data.services.length > 0 ? (
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th>Price</th>
                          <th>Minutes</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {pg.data.services.map((s) => (
                          <tr key={s.name}>
                            <td>{s.name}</td>
                            <td className="money">{money(s.price_cents)}</td>
                            <td className="muted">{s.duration_minutes ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>
                              {shop.can.edit_page && (
                                <button
                                  className="btn sm"
                                  disabled={act.busy}
                                  onClick={() =>
                                    act.run(
                                      `${s.name} removed.`,
                                      () => deleteService(tenantId, s.name),
                                      () => pg.reload(),
                                    )
                                  }
                                >
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyState title="No services listed">
                      A price list is the most common reason a shop&rsquo;s own page
                      beats a booking-platform profile. Nothing is listed yet.
                    </EmptyState>
                  )}

                  {shop.can.edit_page && (
                    <div
                      className="grid cols-4"
                      style={{ marginTop: 16, alignItems: "end" }}
                    >
                      <Field label="Service">
                        <input
                          type="text"
                          value={svcName}
                          onChange={(e) => setSvcName(e.target.value)}
                        />
                      </Field>
                      <Field label="Price">
                        <input
                          type="number"
                          min={0}
                          value={svcPrice}
                          onChange={(e) => setSvcPrice(e.target.value)}
                        />
                      </Field>
                      <Field label="Minutes">
                        <input
                          type="number"
                          min={0}
                          value={svcMins}
                          onChange={(e) => setSvcMins(e.target.value)}
                        />
                      </Field>
                      <button
                        className="btn primary"
                        disabled={act.busy || !svcName.trim()}
                        onClick={() =>
                          act.run(
                            "Service saved.",
                            () =>
                              saveService({
                                tenant: tenantId,
                                name: svcName.trim(),
                                priceCents: svcPrice
                                  ? Math.round(Number(svcPrice) * 100)
                                  : null,
                                minutes: svcMins ? Number(svcMins) : null,
                                order: (pg.data?.services.length ?? 0) + 1,
                              }),
                            () => {
                              setSvcName("");
                              setSvcPrice("");
                              setSvcMins("");
                              pg.reload();
                            },
                          )
                        }
                      >
                        Add
                      </button>
                    </div>
                  )}
                </Card>
              )}
            </>
          );
        }}
      </Loaded>

      <Toast notice={act.notice} onClose={act.clear} />
    </>
  );
}

function HoursRow({
  name,
  closed,
  opens,
  closes,
  disabled,
  onSave,
}: {
  day: number;
  name: string;
  closed: boolean;
  opens: string;
  closes: string;
  disabled: boolean;
  onSave: (closed: boolean, opens: string, closes: string) => void;
}) {
  const [c, setC] = useState(closed);
  const [o, setO] = useState(opens.slice(0, 5));
  const [cl, setCl] = useState(closes.slice(0, 5));

  return (
    <tr>
      <td>
        <label className="row" style={{ gap: 6 }}>
          <span style={{ minWidth: 84 }}>{name}</span>
          <input type="checkbox" checked={c} onChange={(e) => setC(e.target.checked)} />
          <span className="dim" style={{ fontSize: 11.5 }}>
            closed
          </span>
        </label>
      </td>
      <td>
        <input
          type="time"
          value={o}
          disabled={c}
          onChange={(e) => setO(e.target.value)}
        />
      </td>
      <td>
        <input
          type="time"
          value={cl}
          disabled={c}
          onChange={(e) => setCl(e.target.value)}
        />
      </td>
      <td style={{ textAlign: "right" }}>
        <button className="btn sm" disabled={disabled} onClick={() => onSave(c, o, cl)}>
          Save
        </button>
      </td>
    </tr>
  );
}
