"use client";

import { Fragment, useMemo, useState } from "react";
import {
  DEFAULT_MATCH_CONFIG,
  buildEquipmentRegistry,
  describeScoreFormula,
  formatLocalTime,
  matchFleet,
  tripSpansTimeZones,
  type Load,
  type Match,
  type MatchConfig,
  type Rejection,
  type Truck,
  type TruckResult,
} from "@hl-bos/dispatch-match";
import { SAMPLE_FLEETS } from "@hl-bos/dispatch-match/demo";
import { lbs, miles, parseNumberInput, perMile, usd } from "@/lib/format";
import {
  LOAD_CSV_TEMPLATE,
  OWN_FLEET_ID,
  OWN_FLEET_TENANT,
  TRUCK_CSV_TEMPLATE,
} from "@/lib/fleets";

const equipment = buildEquipmentRegistry();
const typeLabel = (id: string) => equipment.get(id)?.label ?? id;

// ---------------------------------------------------------------------------

function NumField(props: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: string;
  hint?: string;
}) {
  const [raw, setRaw] = useState(String(props.value));
  const [shown, setShown] = useState(props.value);
  // Re-sync when the value is changed from outside (e.g. Reset).
  if (shown !== props.value) {
    setShown(props.value);
    setRaw(String(props.value));
  }
  const parsed = parseNumberInput(raw);
  const invalid = parsed === null || (props.min !== undefined && parsed < props.min);
  return (
    <label className="field" title={props.hint}>
      <span>{props.label}</span>
      <input
        inputMode="decimal"
        className={invalid ? "invalid" : ""}
        value={raw}
        step={props.step}
        onChange={(e) => {
          setRaw(e.target.value);
          const n = parseNumberInput(e.target.value);
          // An invalid entry leaves the model untouched and shows red. It is
          // never silently read as 0.
          if (n !== null && (props.min === undefined || n >= props.min)) {
            setShown(n);
            props.onChange(n);
          }
        }}
      />
    </label>
  );
}

function scoreColor(s: number): string {
  if (s >= 70) return "var(--good)";
  if (s >= 40) return "var(--warn)";
  return "var(--bad)";
}

function Assumptions({
  cfg,
  setCfg,
}: {
  cfg: MatchConfig;
  setCfg: (c: MatchConfig) => void;
}) {
  const set = <K extends keyof MatchConfig>(k: K, v: MatchConfig[K]) =>
    setCfg({ ...cfg, [k]: v });
  const setS = <K extends keyof MatchConfig["score"]>(
    k: K,
    v: MatchConfig["score"][K],
  ) => setCfg({ ...cfg, score: { ...cfg.score, [k]: v } });
  return (
    <div className="panel">
      <h2>Assumptions</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Planning figures, not any fleet&apos;s books. Change them and the ranking
        recomputes.
      </p>
      <NumField
        label="Fuel $/mile"
        value={cfg.fuelCostPerMile}
        min={0}
        onChange={(n) => set("fuelCostPerMile", n)}
      />
      <NumField
        label="Overhead $/mile"
        value={cfg.overheadPerMile}
        min={0}
        hint="Insurance, maintenance, tyres, tolls, admin"
        onChange={(n) => set("overheadPerMile", n)}
      />
      <NumField
        label="Average mph"
        value={cfg.averageMph}
        min={1}
        onChange={(n) => set("averageMph", n)}
      />
      <NumField
        label="Road ÷ straight-line"
        value={cfg.roadCircuityFactor}
        min={1}
        hint="No routing API yet: road miles are estimated as great-circle miles × this factor"
        onChange={(n) => set("roadCircuityFactor", n)}
      />
      <NumField
        label="Load/unload hours"
        value={cfg.dwellHoursPerStop}
        min={0}
        onChange={(n) => set("dwellHoursPerStop", n)}
      />
      <NumField
        label="Hours per driver-day"
        value={cfg.hoursPerDriverDay}
        min={1}
        onChange={(n) => set("hoursPerDriverDay", n)}
      />

      <h3>Score</h3>
      <label className="field">
        <span>Contribution means</span>
        <select
          value={cfg.contributionBasis}
          onChange={(e) =>
            set(
              "contributionBasis",
              e.target.value === "vs-empty-return" ? "vs-empty-return" : "full-trip",
            )
          }
        >
          <option value="full-trip">Full trip</option>
          <option value="vs-empty-return">vs. empty home</option>
        </select>
      </label>
      <p className="small muted" style={{ margin: "2px 0 6px" }}>
        {cfg.contributionBasis === "full-trip"
          ? "Pay minus the cost of deadhead + loaded miles."
          : "Pay minus the EXTRA cost over driving home empty — what the backhaul actually adds."}
      </p>
      <NumField
        label="Weight: contribution"
        value={cfg.score.contributionWeight}
        min={0}
        onChange={(n) => setS("contributionWeight", n)}
      />
      <NumField
        label="Weight: $/total mile"
        value={cfg.score.revenuePerMileWeight}
        min={0}
        onChange={(n) => setS("revenuePerMileWeight", n)}
      />
      <NumField
        label="Contribution = 0 at $"
        value={cfg.score.contributionFloor}
        onChange={(n) => setS("contributionFloor", n)}
      />
      <NumField
        label="Contribution = full at $"
        value={cfg.score.contributionTarget}
        onChange={(n) => setS("contributionTarget", n)}
      />
      <NumField
        label="$/mile = 0 at"
        value={cfg.score.revenuePerMileFloor}
        min={0}
        onChange={(n) => setS("revenuePerMileFloor", n)}
      />
      <NumField
        label="$/mile = full at"
        value={cfg.score.revenuePerMileTarget}
        min={0}
        onChange={(n) => setS("revenuePerMileTarget", n)}
      />
      <pre className="formula">{describeScoreFormula(cfg.score)}</pre>
      <div className="row-actions">
        <button onClick={() => setCfg(DEFAULT_MATCH_CONFIG)}>Reset to defaults</button>
      </div>
    </div>
  );
}

function MatchDetail({ m, truck, load }: { m: Match; truck: Truck; load: Load }) {
  const e = m.economics;
  // Each time in the zone of the place it happens; zones are labelled when the
  // trip crosses one, so two times on screen are never silently in different zones.
  const showZone = tripSpansTimeZones(truck, load);
  const at = (ref: string) => (iso: string) =>
    formatLocalTime(Date.parse(iso), ref, { showZone });
  const tTruck = at(truck.availability.earliest);
  const tPickup = at(load.pickup.earliest);
  const tDelivery = at(load.delivery.earliest);
  return (
    <div className="detail-grid">
      <div>
        <h4>Costs (est.)</h4>
        <dl>
          <dt>Revenue</dt>
          <dd>{usd(e.revenue)}</dd>
          <dt>Fuel ({miles(e.totalMiles)})</dt>
          <dd>{usd(e.fuelCost)}</dd>
          <dt>
            Driver{" "}
            {truck.driverCost.basis === "per-day"
              ? `(${e.driverDays ?? 0} days × ${usd(truck.driverCost.amount)})`
              : `(${usd(truck.driverCost.amount, 2)}/mi)`}
          </dt>
          <dd>{usd(e.driverCost)}</dd>
          <dt>Overhead</dt>
          <dd>{usd(e.overheadCost)}</dd>
          <dt>Total operating cost</dt>
          <dd>{usd(e.totalOperatingCost)}</dd>
          <dt>
            <b>Projected contribution</b>
          </dt>
          <dd className={e.projectedContribution < 0 ? "neg" : "pos"}>
            <b>{usd(e.projectedContribution)}</b>
          </dd>
        </dl>
      </div>
      <div>
        <h4>Versus driving home empty</h4>
        <dl>
          <dt>Empty home from {truck.currentLocation.name}</dt>
          <dd>{miles(e.vsEmptyReturn.emptyReturnMiles)}</dd>
          <dt>Delivery → home</dt>
          <dd>{miles(e.vsEmptyReturn.milesAfterDeliveryToHome)}</dd>
          <dt>Extra miles to take it</dt>
          <dd>{miles(e.vsEmptyReturn.extraMiles)}</dd>
          <dt>Extra cost</dt>
          <dd>{usd(e.vsEmptyReturn.extraCost)}</dd>
          <dt>
            <b>Adds to the trip</b>
          </dt>
          <dd className={e.vsEmptyReturn.incrementalContribution < 0 ? "neg" : "pos"}>
            <b>{usd(e.vsEmptyReturn.incrementalContribution)}</b>
          </dd>
        </dl>
      </div>
      <div>
        <h4>Timing (est.)</h4>
        <dl>
          <dt>Empty at {truck.currentLocation.name}</dt>
          <dd>{tTruck(truck.availability.earliest)}</dd>
          <dt>At pickup</dt>
          <dd>{tPickup(m.timing.arriveAtPickup)}</dd>
          <dt>Loaded, rolling</dt>
          <dd>{tPickup(m.timing.loadedDeparture)}</dd>
          <dt>At delivery</dt>
          <dd>{tDelivery(m.timing.arriveAtDelivery)}</dd>
          <dt>Unloaded</dt>
          <dd>{tDelivery(m.timing.finished)}</dd>
          <dt>Delivery window</dt>
          <dd>
            {tDelivery(load.delivery.earliest)} – {tDelivery(load.delivery.latest)}
          </dd>
        </dl>
      </div>
      <div>
        <h4>Score</h4>
        <p className="small" style={{ margin: 0, fontFamily: "var(--mono)" }}>
          {m.score.explanation}
        </p>
        <h4 style={{ marginTop: 8 }}>Return-load probability</h4>
        <p className="small" style={{ margin: 0 }}>
          {m.returnLoadProbability.available
            ? `${Math.round(m.returnLoadProbability.probability * 100)}% — loads seen in ${m.returnLoadProbability.weeksWithLoads} of ${m.returnLoadProbability.weeksObserved} recorded weeks.`
            : `Not estimated. ${m.returnLoadProbability.reason}`}
        </p>
        {m.warnings.length > 0 && (
          <>
            <h4 style={{ marginTop: 8 }}>Check before booking</h4>
            <ul className="reasons warn">
              {m.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </>
        )}
        {load.notes && <p className="small muted">Shipper note: {load.notes}</p>}
      </div>
    </div>
  );
}

function TruckPanel({
  r,
  loadsById,
}: {
  r: TruckResult;
  loadsById: Map<string, Load>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const t = r.truck;
  const wrongEquipment = r.rejections.filter(
    (x) => x.code === "equipment-not-accepted",
  );
  const failedOther: Rejection[] = r.rejections.filter(
    (x) => x.code !== "equipment-not-accepted",
  );
  return (
    <div className="panel">
      <div className="truck-head">
        <div>
          <h2 style={{ marginBottom: 2 }}>
            {t.name} <span className="tag">{typeLabel(t.equipmentType)}</span>
          </h2>
          <div className="meta">
            Empty at <b>{t.currentLocation.name}</b> from{" "}
            {formatLocalTime(
              Date.parse(t.availability.earliest),
              t.availability.earliest,
              {
                showZone: true,
              },
            )}
            {" · "}free until{" "}
            {formatLocalTime(Date.parse(t.availability.latest), t.availability.latest, {
              showZone: true,
            })}
            {" · "}home {t.home.name}
          </div>
          <div className="meta">
            {lbs(t.capacity.weightLbs)}
            {t.capacity.volumeCuYd !== undefined
              ? ` · ${t.capacity.volumeCuYd} cu yd`
              : ""}
            {" · "}deadhead ≤ {miles(t.maxDeadheadMiles)}
            {" · "}delivers within {miles(t.serviceRadiusMiles)} of home
            {" · "}driver{" "}
            {t.driverCost.basis === "per-mile"
              ? `${usd(t.driverCost.amount, 2)}/mi`
              : `${usd(t.driverCost.amount)}/day`}
            {t.commodityRestrictions?.exclude?.length
              ? ` · won't haul ${t.commodityRestrictions.exclude.join(", ")}`
              : ""}
          </div>
        </div>
      </div>

      {r.matches.length === 0 ? (
        <p className="empty">
          No load passes every hard constraint for this truck. See why below.
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="l">#</th>
                <th className="l">Score</th>
                <th className="l">Load</th>
                <th className="l">Lane</th>
                <th>Pay</th>
                <th>Deadhead</th>
                <th>Loaded</th>
                <th>$/loaded mi</th>
                <th>$/total mi</th>
                <th>Op. cost</th>
                <th>Contribution</th>
                <th title="What taking this load adds over driving home empty">
                  vs. empty home
                </th>
              </tr>
            </thead>
            <tbody>
              {r.matches.map((m) => {
                const l = loadsById.get(m.loadId);
                if (!l) return null;
                const e = m.economics;
                const isOpen = open === m.loadId;
                return (
                  <Fragment key={m.loadId}>
                    <tr
                      className="row"
                      onClick={() => setOpen(isOpen ? null : m.loadId)}
                      aria-expanded={isOpen}
                    >
                      <td className="l">{m.rank}</td>
                      <td className="l">
                        <span
                          className="score"
                          style={{ background: scoreColor(m.score.score) }}
                        >
                          {m.score.score}
                        </span>
                        {m.warnings.length > 0 && (
                          <span className="warn" title={m.warnings.join("\n")}>
                            {" "}
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className="l">
                        {l.id}
                        {l.source.kind === "csv" && (
                          <span className="tag csv">CSV</span>
                        )}
                        <div className="small muted">
                          {l.commodity.name} · {lbs(l.weightLbs)}
                          {l.volumeCuYd !== undefined ? ` · ${l.volumeCuYd} yd³` : ""}
                        </div>
                      </td>
                      <td className="l">
                        {l.origin.name} → {l.destination.name}
                      </td>
                      <td>
                        {usd(e.revenue)}
                        {l.pay.basis === "per-mile" && (
                          <div className="small muted">{perMile(l.pay.rate)}</div>
                        )}
                      </td>
                      <td>{miles(e.deadheadMiles)}</td>
                      <td>{miles(e.loadedMiles)}</td>
                      <td>{perMile(e.revenuePerLoadedMile)}</td>
                      <td>{perMile(e.revenuePerTotalMile)}</td>
                      <td>{usd(e.totalOperatingCost)}</td>
                      <td className={e.projectedContribution < 0 ? "neg" : "pos"}>
                        {usd(e.projectedContribution)}
                      </td>
                      <td
                        className={
                          e.vsEmptyReturn.incrementalContribution < 0 ? "neg" : ""
                        }
                      >
                        {usd(e.vsEmptyReturn.incrementalContribution)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="detail">
                        <td colSpan={12}>
                          <MatchDetail m={m} truck={t} load={l} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            Click a row for the cost, timing and score breakdown. Miles are estimates
            (see Assumptions).
          </p>
        </div>
      )}

      <details>
        <summary>
          Why not the others? ({failedOther.length} failed a constraint
          {wrongEquipment.length > 0
            ? `, ${wrongEquipment.length} need other equipment`
            : ""}
          )
        </summary>
        {failedOther.length === 0 ? (
          <p className="empty">Every compatible load made the list.</p>
        ) : (
          <ul className="reasons">
            {failedOther.map((x) => (
              <li key={x.loadId}>
                <b>{x.loadId}</b> ({loadsById.get(x.loadId)?.commodity.name}):{" "}
                {x.reason}
              </li>
            ))}
          </ul>
        )}
        {wrongEquipment.length > 0 && (
          <p className="small muted">
            Need other equipment: {wrongEquipment.map((x) => x.loadId).join(", ")}.
          </p>
        )}
      </details>
    </div>
  );
}

type ImportKind = "loads" | "trucks";
type ImportResult =
  | {
      ok: true;
      kind: "loads";
      loads: Load[];
      errors: { row: number; message: string }[];
    }
  | {
      ok: true;
      kind: "trucks";
      trucks: Truck[];
      errors: { row: number; message: string }[];
    }
  | { ok: false; error: string };

function ImportPanel(props: {
  kind: ImportKind;
  tenantId: string;
  template: string;
  onLoads?: (loads: Load[]) => void;
  onTrucks?: (trucks: Truck[]) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { imported: number; errors: { row: number; message: string }[] }
    | { failed: string }
    | null
  >(null);
  const noun = props.kind === "loads" ? "loads" : "trucks";

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: props.kind, text, tenantId: props.tenantId }),
      });
      const r = (await res.json()) as ImportResult;
      if (!r.ok) {
        setResult({ failed: r.error });
      } else if (r.kind === "loads") {
        setResult({ imported: r.loads.length, errors: r.errors });
        if (r.loads.length > 0) props.onLoads?.(r.loads);
      } else {
        setResult({ imported: r.trucks.length, errors: r.errors });
        if (r.trucks.length > 0) props.onTrucks?.(r.trucks);
      }
    } catch {
      setResult({ failed: "The app did not answer. Nothing was imported." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Add {noun} from CSV</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Locations can be anywhere in the US: <code>City, ST</code>, a 5-digit ZIP, or{" "}
        <code>lat, lon</code>. A location that does not resolve is refused with the
        reason, never guessed. Every time needs its UTC offset (e.g. <code>-05:00</code>
        ) because a national fleet crosses time zones. Imported {noun} live in this
        browser tab only and are not saved.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={props.template.split("\n")[0]}
        aria-label={`${noun} CSV`}
      />
      <div className="row-actions">
        <button
          className="primary"
          disabled={text.trim() === "" || busy}
          onClick={() => void run()}
        >
          {busy ? "Importing…" : `Import ${noun}`}
        </button>
        <button onClick={() => setText(props.template)}>Fill with an example</button>
      </div>
      {result && (
        <div className="small" style={{ marginTop: 8 }}>
          {"failed" in result ? (
            <div className="neg">{result.failed}</div>
          ) : (
            <>
              <div className={result.imported > 0 ? "pos" : ""}>
                Imported {result.imported} {noun}.
              </div>
              {result.errors.length > 0 && (
                <ul className="reasons neg">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PlaceCheck() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  async function look() {
    try {
      const res = await fetch(`/api/place?q=${encodeURIComponent(q)}`);
      const r = (await res.json()) as
        | {
            ok: true;
            place: { name: string; lat: number; lon: number };
            matchedBy: string;
          }
        | { ok: false; error: string };
      setAnswer(
        r.ok
          ? `${r.place.name} — ${r.place.lat.toFixed(4)}, ${r.place.lon.toFixed(4)} (matched by ${r.matchedBy})`
          : r.error,
      );
    } catch {
      setAnswer("The app did not answer.");
    }
  }
  return (
    <div className="panel">
      <h2>Check a location</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        See exactly where the engine will put a city, ZIP or coordinate before you
        import.
      </p>
      <form
        className="row-actions"
        onSubmit={(e) => {
          e.preventDefault();
          void look();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Boise, ID or 99501"
          aria-label="Location to check"
          style={{ flex: 1, minWidth: 0, padding: "4px 6px" }}
        />
        <button type="submit" disabled={q.trim() === ""}>
          Check
        </button>
      </form>
      {answer && (
        <p className="small" style={{ marginBottom: 0 }}>
          {answer}
        </p>
      )}
    </div>
  );
}

const OWN_FLEET_LABEL = "Your own fleet (import trucks and loads by CSV)";

export function MatchBoard() {
  const [cfg, setCfg] = useState<MatchConfig>(DEFAULT_MATCH_CONFIG);
  const [fleetId, setFleetId] = useState<string>(SAMPLE_FLEETS[0]?.id ?? OWN_FLEET_ID);
  const [extraLoads, setExtraLoads] = useState<Record<string, Load[]>>({});
  const [ownTrucks, setOwnTrucks] = useState<Truck[]>([]);

  const sample = SAMPLE_FLEETS.find((f) => f.id === fleetId);
  const isOwn = sample === undefined;
  const tenantId = sample?.tenantId ?? OWN_FLEET_TENANT;
  const trucks: readonly Truck[] = sample?.trucks ?? ownTrucks;
  const added = useMemo(() => extraLoads[fleetId] ?? [], [extraLoads, fleetId]);

  const loads = useMemo(() => {
    // An imported id that collides with an existing one replaces it, so a
    // corrected CSV can be re-pasted.
    const ids = new Set(added.map((l) => l.id));
    return [...(sample?.loads ?? []).filter((l) => !ids.has(l.id)), ...added];
  }, [added, sample]);
  const loadsById = useMemo(() => new Map(loads.map((l) => [l.id, l])), [loads]);
  const run = useMemo(
    () => matchFleet({ tenantId, trucks, loads, config: cfg, equipment }),
    [tenantId, trucks, loads, cfg],
  );
  const trucksById = new Map(trucks.map((t) => [t.id, t]));
  const totalMatches = run.trucks.reduce((n, t) => n + t.matches.length, 0);

  const addLoads = (ls: Load[]) =>
    setExtraLoads((prev) => {
      const ids = new Set(ls.map((l) => l.id));
      return {
        ...prev,
        [fleetId]: [...(prev[fleetId] ?? []).filter((l) => !ids.has(l.id)), ...ls],
      };
    });
  const addTrucks = (ts: Truck[]) =>
    setOwnTrucks((prev) => {
      const ids = new Set(ts.map((t) => t.id));
      return [...prev.filter((t) => !ids.has(t.id)), ...ts];
    });

  return (
    <div className="wrap">
      <header className="top">
        <h1>DispatchOS Match</h1>
        <span className="sub">
          Backhaul freight worth taking on the way home — ranked by what it earns.
          Anywhere in the US.
        </span>
      </header>

      <label className="fleet-pick">
        <span>Fleet</span>
        <select
          value={fleetId}
          onChange={(e) => setFleetId(e.target.value)}
          aria-label="Fleet"
        >
          {SAMPLE_FLEETS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
          <option value={OWN_FLEET_ID}>{OWN_FLEET_LABEL}</option>
        </select>
      </label>

      {sample ? (
        <div className="demo-banner">
          <b>SAMPLE DATA.</b> {sample.label}. Trucks, shippers, rates and loads are
          invented for demonstration — not any carrier&apos;s real freight. Miles are
          estimated (no routing API is connected), and no load board is connected.{" "}
          {run.trucks.length} trucks matched against {loads.length} loads
          {added.length > 0 ? ` (${added.length} from your CSV)` : ""}: {totalMatches}{" "}
          feasible pairings.
        </div>
      ) : (
        <div className="demo-banner own">
          <b>YOUR FLEET.</b> Only what you import below — nothing is invented and
          nothing is saved.{" "}
          {trucks.length === 0
            ? "Start by importing your trucks, then the loads you are considering."
            : `${trucks.length} truck(s) matched against ${loads.length} load(s): ${totalMatches} feasible pairings.`}{" "}
          Miles are estimated (no routing API is connected).
        </div>
      )}

      <div className="grid">
        <aside>
          <Assumptions cfg={cfg} setCfg={setCfg} />
          <PlaceCheck />
        </aside>
        <main>
          {isOwn && (
            <ImportPanel
              kind="trucks"
              tenantId={tenantId}
              template={TRUCK_CSV_TEMPLATE}
              onTrucks={addTrucks}
            />
          )}
          {isOwn && ownTrucks.length > 0 && (
            <div className="row-actions" style={{ marginTop: -8, marginBottom: 16 }}>
              <button onClick={() => setOwnTrucks([])}>Remove imported trucks</button>
            </div>
          )}

          {run.trucks.map((r) => (
            <TruckPanel key={`${fleetId}:${r.truck.id}`} r={r} loadsById={loadsById} />
          ))}

          {run.dedicated.length > 0 && (
            <div className="panel">
              <h2>Not matched against spot freight</h2>
              {run.dedicated.map((d) => {
                const t = trucksById.get(d.truckId);
                return (
                  <p key={d.truckId} style={{ margin: "4px 0" }}>
                    <b>{t?.name ?? d.truckId}</b>
                    {t && (
                      <span className="tag">{typeLabel(t.equipmentType)}</span>
                    )} — {d.note}
                  </p>
                );
              })}
            </div>
          )}

          {(loads.length > 0 || !isOwn) && (
            <div className="panel">
              <h2>Loads no truck can take ({run.unmatchedLoads.length})</h2>
              {run.unmatchedLoads.length === 0 ? (
                <p className="empty">Every load has at least one feasible truck.</p>
              ) : (
                <ul className="reasons">
                  {run.unmatchedLoads.map((u) => {
                    const l = loadsById.get(u.loadId);
                    return (
                      <li key={u.loadId}>
                        <b>{u.loadId}</b>{" "}
                        {l &&
                          `${l.commodity.name}, ${l.origin.name} → ${l.destination.name}`}
                        <div className="small muted">{u.summary}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <ImportPanel
            key={`loads:${fleetId}`}
            kind="loads"
            tenantId={tenantId}
            template={LOAD_CSV_TEMPLATE}
            onLoads={addLoads}
          />
          {added.length > 0 && (
            <div className="row-actions" style={{ marginTop: -8, marginBottom: 16 }}>
              <button
                onClick={() => setExtraLoads((prev) => ({ ...prev, [fleetId]: [] }))}
              >
                Remove imported loads
              </button>
            </div>
          )}

          <p className="small muted">
            Return-load probability is shown only where recorded lane history supports
            it. None of these fleets has any, so every match says &ldquo;not
            estimated&rdquo; rather than showing an invented percentage.
          </p>
        </main>
      </div>
    </div>
  );
}
