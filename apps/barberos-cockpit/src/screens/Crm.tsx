"use client";

import { useState } from "react";

import {
  capabilityState,
  client,
  clients,
  clientsDue,
  enableCapability,
  myShops,
  recordVisit,
  saveClient,
  type ClientDetail,
  type ClientRow,
  type DueClient,
} from "@/lib/api";
import { useAction, useAsync } from "@/lib/hooks";
import { money, rhythmNote, when } from "@/lib/model";
import { Card, EmptyState, Field } from "@/components/ui";
import { CapabilityGate, Crumbs, Loaded, PageHead, Toast } from "@/components/parts";

/**
 * Screens 12 and 13 — client management, and retention.
 *
 * The retention list is not a mailing schedule: clients_due() returns only
 * clients with a KNOWN rhythm (three visits or more) who are past it, so a new
 * client never appears as "overdue" because a fixed interval elapsed. And
 * nothing here sends a message — there is no SMS or email provider on this
 * platform, so the list is a call list for a person.
 *
 * Lifetime value is never shown without how many visits have no price
 * recorded, because "$420 across 12 visits" reads as complete when three of
 * them were never priced.
 */
export default function Crm({
  tenantId,
  onBack,
}: {
  tenantId: string;
  onBack: () => void;
}) {
  const shops = useAsync(() => myShops(), []);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const list = useAsync(() => clients(tenantId, query), [tenantId, query]);
  const due = useAsync(() => clientsDue(tenantId), [tenantId]);
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useAsync(
    () => (openId ? client(openId) : Promise.resolve(null)),
    [openId],
  );
  const act = useAction();

  const caps = useAsync(() => capabilityState(tenantId), [tenantId]);

  const shop = shops.data?.find((s) => s.tenant_id === tenantId) ?? null;
  const crmOn = (caps.data ?? []).some(
    (c) => c.capability_key.toLowerCase() === "client_crm",
  );

  const [nName, setNName] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [nEmail, setNEmail] = useState("");
  const [nNotes, setNNotes] = useState("");

  const [vDate, setVDate] = useState(new Date().toISOString().slice(0, 10));
  const [vPrice, setVPrice] = useState("");
  const [vService, setVService] = useState("");
  const [vBarber, setVBarber] = useState("");
  const [vSides, setVSides] = useState("");
  const [vTopGuard, setVTopGuard] = useState("");
  const [vTopFinish, setVTopFinish] = useState("");
  const [vNotes, setVNotes] = useState("");

  function reload() {
    list.reload();
    due.reload();
    detail.reload();
    caps.reload();
  }

  return (
    <>
      <Crumbs
        trail={[
          { label: "Client shops", go: onBack },
          { label: shop?.shop_name ?? "Shop" },
          { label: "Clients" },
        ]}
      />
      <PageHead
        title={`${shop?.shop_name ?? "Shop"} — clients`}
        sub="Every client, every visit, and the cut itself. This is the one growth capability that has actually shipped."
      />

      {!caps.loading && !crmOn && (
        <CapabilityGate
          capability="client_crm"
          name="Client CRM"
          what="Clients, visits and the shop's tools all live in tables that refuse a write until this capability is enabled for the shop. Nothing below can be saved while it is off."
          canEnable={shop?.can.manage_shop ?? false}
          busy={act.busy}
          onEnable={() =>
            act.run(
              "Client CRM switched on.",
              () => enableCapability(tenantId, "client_crm"),
              reload,
            )
          }
        />
      )}

      <div className="grid cols-3" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat-label">Clients on file</div>
          <div className="stat-value" style={{ fontSize: 26 }}>
            {list.data?.length ?? "—"}
          </div>
          <div className="stat-sub">
            {query ? `matching "${query}"` : "in this shop's records"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Overdue against their own rhythm</div>
          <div className="stat-value" style={{ fontSize: 26 }}>
            {due.data?.length ?? "—"}
          </div>
          <div className="stat-sub">only clients with three visits or more</div>
        </div>
        <div className="stat">
          <div className="stat-label">Rhythm unknown</div>
          <div className="stat-value" style={{ fontSize: 26 }}>
            {list.data ? list.data.filter((c) => c.visits < 3).length : "—"}
          </div>
          <div className="stat-sub">too few visits to know when they are due</div>
        </div>
      </div>

      <div className="grid cols-2">
        <Card title="Overdue — a call list, not a campaign">
          <Loaded
            state={due}
            isEmpty={(d: DueClient[]) => d.length === 0}
            empty={
              <EmptyState title="Nobody is overdue">
                A client only appears here once they have a rhythm of their own — three
                visits or more — and are past it. Nobody qualifies yet, which is not the
                same as everybody being on time.
              </EmptyState>
            }
          >
            {(rows) => (
              <>
                <div className="banner" style={{ marginBottom: 12 }}>
                  Nothing is sent from here. There is no SMS or email provider connected
                  to this platform, so this is a list for somebody to phone.
                </div>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Phone</th>
                      <th>Last in</th>
                      <th>Usually</th>
                      <th>Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => setOpenId(r.id)}
                      >
                        <td style={{ fontWeight: 600 }}>{r.display_name}</td>
                        <td className="muted">{r.phone ?? "—"}</td>
                        <td className="muted">{when(r.last_visit)}</td>
                        <td className="muted">
                          {r.typical_days === null ? "—" : `every ${r.typical_days}d`}
                        </td>
                        <td>
                          <span className="badge warn">{r.overdue_by_days}d</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Loaded>
        </Card>

        <Card title="All clients">
          <form
            className="row"
            style={{ marginBottom: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search);
            }}
          >
            <input
              type="search"
              placeholder="Name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn" type="submit">
              Search
            </button>
          </form>
          <Loaded
            state={list}
            isEmpty={(d: ClientRow[]) => d.length === 0}
            empty={
              <EmptyState title={query ? "No client matched" : "No clients yet"}>
                {query
                  ? "Nothing in this shop's records matches."
                  : "Nothing has been recorded for this shop. A client record is what every other capability is built on."}
              </EmptyState>
            }
          >
            {(rows) => (
              <div className="list">
                {rows.map((r) => (
                  <button
                    className="li"
                    key={r.id}
                    style={{ textAlign: "left", cursor: "pointer" }}
                    onClick={() => setOpenId(r.id)}
                  >
                    <span>
                      <span style={{ fontWeight: 600 }}>{r.display_name}</span>
                      <div className="dim" style={{ fontSize: 11.5 }}>
                        {r.phone ?? "no phone"} · last in {when(r.last_visit)}
                      </div>
                    </span>
                    <span className={`badge ${r.visits >= 3 ? "info" : "demo"}`}>
                      {r.visits} visit{r.visits === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Loaded>
        </Card>
      </div>

      {openId && (
        <Card
          title="Client record"
          action={
            <button className="btn sm" onClick={() => setOpenId(null)}>
              Close
            </button>
          }
        >
          <Loaded
            state={detail}
            empty={<EmptyState title="That client could not be read" />}
          >
            {(d: ClientDetail) => (
              <>
                <div className="grid cols-3">
                  <div>
                    <h3 style={{ fontSize: 17 }}>{d.display_name}</h3>
                    <dl className="kv" style={{ marginTop: 8 }}>
                      <dt>Phone</dt>
                      <dd>{d.phone ?? "—"}</dd>
                      <dt>Email</dt>
                      <dd>{d.email ?? "—"}</dd>
                      <dt>On file since</dt>
                      <dd>{when(d.since)}</dd>
                    </dl>
                    {d.notes && (
                      <p className="muted" style={{ fontSize: 13 }}>
                        {d.notes}
                      </p>
                    )}
                  </div>
                  <div className="stat">
                    <div className="stat-label">Rhythm</div>
                    <div style={{ fontSize: 13.5, marginTop: 6 }}>
                      {rhythmNote(d.rhythm)}
                    </div>
                    <div className="stat-sub">{d.rhythm.basis}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Recorded spend</div>
                    <div className="stat-value money" style={{ fontSize: 24 }}>
                      {money(d.value.total_cents)}
                    </div>
                    <div className="stat-sub">
                      across {d.value.visits} visit{d.value.visits === 1 ? "" : "s"}
                      {d.value.visits_without_a_price > 0
                        ? ` — ${d.value.visits_without_a_price} of them with no price recorded, so this total is lower than what they actually spent`
                        : ""}
                    </div>
                  </div>
                </div>

                <h4 className="section-title" style={{ marginTop: 20 }}>
                  Visits
                </h4>
                {d.visits.length === 0 ? (
                  <EmptyState title="No visits recorded" />
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Service</th>
                        <th>The cut</th>
                        <th>Barber</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.visits.map((v) => (
                        <tr key={v.id}>
                          <td>{when(v.visited_on)}</td>
                          <td className="muted">{v.service_name ?? "—"}</td>
                          <td className="muted">
                            {[
                              v.sides_guard !== null ? `sides ${v.sides_guard}` : null,
                              v.top_guard !== null ? `top ${v.top_guard}` : null,
                              v.top_finish,
                              v.fade,
                              v.beard,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                          <td className="muted">{v.barber ?? "—"}</td>
                          <td className="money">{money(v.price_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h4 className="section-title" style={{ marginTop: 20 }}>
                  Record a visit
                </h4>
                <div className="grid cols-4">
                  <Field label="Date">
                    <input
                      type="date"
                      value={vDate}
                      onChange={(e) => setVDate(e.target.value)}
                    />
                  </Field>
                  <Field label="Service">
                    <input
                      type="text"
                      value={vService}
                      onChange={(e) => setVService(e.target.value)}
                    />
                  </Field>
                  <Field label="Price">
                    <input
                      type="number"
                      min={0}
                      value={vPrice}
                      onChange={(e) => setVPrice(e.target.value)}
                    />
                  </Field>
                  <Field label="Barber">
                    <input
                      type="text"
                      value={vBarber}
                      onChange={(e) => setVBarber(e.target.value)}
                    />
                  </Field>
                  <Field label="Sides guard (0–8)">
                    <input
                      type="number"
                      min={0}
                      max={8}
                      value={vSides}
                      onChange={(e) => setVSides(e.target.value)}
                    />
                  </Field>
                  <Field label="Top guard (0–8)">
                    <input
                      type="number"
                      min={0}
                      max={8}
                      value={vTopGuard}
                      onChange={(e) => setVTopGuard(e.target.value)}
                    />
                  </Field>
                  <Field label="Top finish">
                    <input
                      type="text"
                      placeholder="scissor, clipper…"
                      value={vTopFinish}
                      onChange={(e) => setVTopFinish(e.target.value)}
                    />
                  </Field>
                  <Field label="Notes">
                    <input
                      type="text"
                      value={vNotes}
                      onChange={(e) => setVNotes(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="banner">
                  Leave the price blank if you do not know it. A guessed figure would
                  corrupt every lifetime-value number afterwards, and the record already
                  counts and reports visits with no price.
                </div>
                <button
                  className="btn primary"
                  style={{ marginTop: 12 }}
                  disabled={act.busy || !vDate || !crmOn}
                  onClick={() =>
                    act.run(
                      "Visit recorded.",
                      () =>
                        recordVisit(tenantId, d.id, {
                          visited_on: vDate,
                          ...(vService.trim() ? { service_name: vService.trim() } : {}),
                          ...(vBarber.trim() ? { barber: vBarber.trim() } : {}),
                          ...(vPrice
                            ? { price_cents: Math.round(Number(vPrice) * 100) }
                            : {}),
                          ...(vSides !== "" ? { sides_guard: Number(vSides) } : {}),
                          ...(vTopGuard !== "" ? { top_guard: Number(vTopGuard) } : {}),
                          ...(vTopFinish.trim()
                            ? { top_finish: vTopFinish.trim() }
                            : {}),
                          ...(vNotes.trim() ? { notes: vNotes.trim() } : {}),
                        }),
                      () => {
                        setVPrice("");
                        setVService("");
                        setVNotes("");
                        reload();
                      },
                    )
                  }
                >
                  Record visit
                </button>
              </>
            )}
          </Loaded>
        </Card>
      )}

      <Card title="Add a client">
        <div className="grid cols-4">
          <Field label="Name">
            <input
              type="text"
              value={nName}
              onChange={(e) => setNName(e.target.value)}
            />
          </Field>
          <Field label="Phone — matched to de-duplicate">
            <input
              type="tel"
              value={nPhone}
              onChange={(e) => setNPhone(e.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={nEmail}
              onChange={(e) => setNEmail(e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <input
              type="text"
              value={nNotes}
              onChange={(e) => setNNotes(e.target.value)}
            />
          </Field>
        </div>
        <button
          className="btn primary"
          disabled={act.busy || !nName.trim() || !crmOn}
          onClick={() =>
            act.run(
              "Client saved.",
              () =>
                saveClient({
                  tenant: tenantId,
                  name: nName.trim(),
                  phone: nPhone.trim(),
                  email: nEmail.trim(),
                  notes: nNotes.trim(),
                }),
              () => {
                setNName("");
                setNPhone("");
                setNEmail("");
                setNNotes("");
                reload();
              },
            )
          }
        >
          Save client
        </button>
      </Card>

      <Toast notice={act.notice} onClose={act.clear} />
    </>
  );
}
