"use client";

import { useState, useTransition } from "react";
import {
  describeCut,
  money,
  FADES,
  GUARDS,
  TOP_FINISHES,
  type ClientDetail,
  type Visit,
} from "@/lib/crm";
import { addClient, addVisit } from "@/app/shop/[tenant]/clients/actions";
import type { Result } from "@/app/shop/[tenant]/actions";
import { Card, button, input } from "./ui";

function Note({ r }: { r: Result | null }) {
  if (r === null) return null;
  return (
    <p
      style={{ margin: "10px 0 0", fontSize: 13, color: r.ok ? "#3fb950" : "#f85149" }}
    >
      {r.message}
    </p>
  );
}

export function AddClient({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", email: "", notes: "" });
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();

  if (!open) {
    return (
      <button style={button(true)} onClick={() => setOpen(true)}>
        Add a client
      </button>
    );
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF({ ...f, [k]: e.target.value });
    setR(null);
  };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input placeholder="Name" value={f.name} onChange={set("name")} style={input} />
        <input
          placeholder="Phone"
          value={f.phone}
          onChange={set("phone")}
          style={input}
        />
        <input
          placeholder="Email"
          value={f.email}
          onChange={set("email")}
          style={input}
        />
        <input
          placeholder="Anything worth remembering"
          value={f.notes}
          onChange={set("notes")}
          style={input}
        />
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6e7681" }}>
        A phone number is how the same regular written down twice stays one person with
        one history.
      </p>
      <div style={{ marginTop: 10 }}>
        <button
          disabled={busy}
          style={button(!busy)}
          onClick={() =>
            start(async () => {
              const res = await addClient(tenantId, f.name, f.phone, f.email, f.notes);
              setR(res);
              if (res.ok) setF({ name: "", phone: "", email: "", notes: "" });
            })
          }
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ ...button(true, "#21262d"), marginLeft: 8, fontWeight: 400 }}
        >
          Done
        </button>
      </div>
      <Note r={r} />
    </div>
  );
}

/**
 * Record what was just cut.
 *
 * Everything is optional except the date, because a barber between customers
 * will record a guard number and a price and nothing else — and a form that
 * demands more than that gets used once. The database refuses the
 * contradictions (a top guard on a scissor cut, a beard guard on a client
 * whose beard was not done), and its refusal is shown verbatim.
 */
export function RecordVisit({
  tenantId,
  clientId,
  knownTools,
}: {
  tenantId: string;
  clientId: string;
  knownTools: string[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({
    visited_on: today,
    service_name: "",
    price: "",
    barber: "",
    sides_guard: "",
    top_finish: "",
    top_guard: "",
    fade: "",
    beard: false,
    beard_guard: "",
    line_up: false,
    part: false,
    notes: "",
  });
  const [tools, setTools] = useState<string[]>([]);
  const [newTool, setNewTool] = useState("");
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();

  const set = (k: keyof typeof v, value: unknown) => {
    setV({ ...v, [k]: value });
    setR(null);
  };
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  function save() {
    const payload: Record<string, unknown> = { visited_on: v.visited_on };
    if (v.service_name.trim() !== "") payload["service_name"] = v.service_name.trim();
    if (v.barber.trim() !== "") payload["barber"] = v.barber.trim();
    if (v.price.trim() !== "") {
      const cents = /^\$?\d+(\.\d{1,2})?$/.test(v.price.trim())
        ? Math.round(Number(v.price.trim().replace("$", "")) * 100)
        : null;
      if (cents === null) {
        // An unreadable price is sent as NO price, never as zero.
        setR({
          ok: false,
          message: `"${v.price.trim()}" is not a price. Use something like 40 or 40.50, or leave it blank.`,
        });
        return;
      }
      payload["price_cents"] = cents;
    }
    if (num(v.sides_guard) !== undefined) payload["sides_guard"] = num(v.sides_guard);
    if (v.top_finish !== "") payload["top_finish"] = v.top_finish;
    if (v.top_finish === "guard" && num(v.top_guard) !== undefined)
      payload["top_guard"] = num(v.top_guard);
    if (v.fade !== "") payload["fade"] = v.fade;
    payload["beard"] = v.beard;
    if (v.beard && num(v.beard_guard) !== undefined)
      payload["beard_guard"] = num(v.beard_guard);
    payload["line_up"] = v.line_up;
    payload["part"] = v.part;
    if (v.notes.trim() !== "") payload["notes"] = v.notes.trim();
    if (tools.length > 0) payload["tools"] = tools;

    start(async () => {
      const res = await addVisit(tenantId, clientId, payload);
      setR(res);
      if (res.ok) {
        setTools([]);
        setV({ ...v, price: "", notes: "" });
      }
    });
  }

  const suggestions = knownTools.filter((t) => !tools.includes(t));

  return (
    <Card title="Record a cut">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field label="Date">
          <input
            type="date"
            value={v.visited_on}
            max={today}
            onChange={(e) => set("visited_on", e.target.value)}
            style={input}
          />
        </Field>
        <Field label="Service">
          <input
            placeholder="Skin fade"
            value={v.service_name}
            onChange={(e) => set("service_name", e.target.value)}
            style={input}
          />
        </Field>
        <Field label="Price">
          <input
            placeholder="$40"
            value={v.price}
            onChange={(e) => set("price", e.target.value)}
            style={input}
          />
        </Field>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 10,
          marginTop: 4,
        }}
      >
        <Field label="Sides">
          <select
            value={v.sides_guard}
            onChange={(e) => set("sides_guard", e.target.value)}
            style={input}
          >
            <option value="">—</option>
            {GUARDS.map((g) => (
              <option key={g} value={g}>
                {g === 0 ? "skin" : `#${g}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Top">
          <select
            value={v.top_finish}
            onChange={(e) => set("top_finish", e.target.value)}
            style={input}
          >
            <option value="">—</option>
            {TOP_FINISHES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        {/* Only offered when it means something — the database refuses it otherwise. */}
        <Field label="Top guard">
          <select
            value={v.top_guard}
            disabled={v.top_finish !== "guard"}
            onChange={(e) => set("top_guard", e.target.value)}
            style={{ ...input, opacity: v.top_finish === "guard" ? 1 : 0.4 }}
          >
            <option value="">—</option>
            {GUARDS.map((g) => (
              <option key={g} value={g}>
                {g === 0 ? "skin" : `#${g}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fade">
          <select
            value={v.fade}
            onChange={(e) => set("fade", e.target.value)}
            style={input}
          >
            <option value="">—</option>
            {FADES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "10px 0" }}>
        <label style={{ fontSize: 14 }}>
          <input
            type="checkbox"
            checked={v.beard}
            onChange={(e) => set("beard", e.target.checked)}
          />{" "}
          Beard
        </label>
        <select
          value={v.beard_guard}
          disabled={!v.beard}
          onChange={(e) => set("beard_guard", e.target.value)}
          style={{ ...input, width: 110, opacity: v.beard ? 1 : 0.4 }}
        >
          <option value="">—</option>
          {GUARDS.map((g) => (
            <option key={g} value={g}>
              {g === 0 ? "skin" : `#${g}`}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 14 }}>
          <input
            type="checkbox"
            checked={v.line_up}
            onChange={(e) => set("line_up", e.target.checked)}
          />{" "}
          Line-up
        </label>
        <label style={{ fontSize: 14 }}>
          <input
            type="checkbox"
            checked={v.part}
            onChange={(e) => set("part", e.target.checked)}
          />{" "}
          Part
        </label>
      </div>

      <Field label="Tools used" hint="Type a new one and it joins your kit list.">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {tools.map((t) => (
            <button
              key={t}
              onClick={() => setTools(tools.filter((x) => x !== t))}
              style={{ ...chip, background: "#132b47", color: "#c9e2ff" }}
            >
              {t} ×
            </button>
          ))}
          {suggestions.map((t) => (
            <button key={t} onClick={() => setTools([...tools, t])} style={chip}>
              + {t}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Wahl Magic Clip"
            value={newTool}
            onChange={(e) => setNewTool(e.target.value)}
            style={{ ...input, flex: 1 }}
          />
          <button
            style={button(true, "#21262d")}
            onClick={() => {
              const t = newTool.trim();
              if (t !== "" && !tools.includes(t)) setTools([...tools, t]);
              setNewTool("");
            }}
          >
            Add
          </button>
        </div>
      </Field>

      <Field label="Notes">
        <input
          placeholder="Cowlick at the crown"
          value={v.notes}
          onChange={(e) => set("notes", e.target.value)}
          style={input}
        />
      </Field>

      <button disabled={busy} style={button(!busy)} onClick={save}>
        {busy ? "Saving…" : "Record it"}
      </button>
      <Note r={r} />
    </Card>
  );
}

export function Timeline({ client }: { client: ClientDetail }) {
  if (client.visits.length === 0) {
    return (
      <Card title="Visits">
        <p style={{ margin: 0, fontSize: 14, color: "#8b949e" }}>
          Nothing recorded yet. The first cut you record starts their history.
        </p>
      </Card>
    );
  }
  return (
    <Card title="Visits" sub={`${client.visits.length}`}>
      {client.visits.map((v) => (
        <VisitRow key={v.id} v={v} />
      ))}
    </Card>
  );
}

function VisitRow({ v }: { v: Visit }) {
  const cut = describeCut(v);
  const price = money(v.priceCents);
  return (
    <div
      style={{
        borderLeft: "3px solid #21262d",
        padding: "2px 0 2px 12px",
        margin: "0 0 14px",
      }}
    >
      <div style={{ fontSize: 14, color: "#e6edf3" }}>
        {new Date(v.visitedOn + "T00:00:00").toLocaleDateString()}
        {v.serviceName !== null && ` · ${v.serviceName}`}
        <span style={{ float: "right", color: price === null ? "#6e7681" : "#8b949e" }}>
          {price ?? "no price recorded"}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "#8b949e", marginTop: 3 }}>
        {cut ?? "No cut details recorded."}
      </div>
      {v.tools.length > 0 && (
        <div style={{ fontSize: 12, color: "#6e7681", marginTop: 3 }}>
          {v.tools.join(", ")}
        </div>
      )}
      {v.notes !== null && (
        <div style={{ fontSize: 13, color: "#8b949e", marginTop: 3 }}>{v.notes}</div>
      )}
      {v.barber !== null && (
        <div style={{ fontSize: 12, color: "#6e7681", marginTop: 3 }}>
          Cut by {v.barber}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 3 }}>{label}</div>
      {hint !== undefined && (
        <div style={{ fontSize: 12, color: "#6e7681", marginBottom: 5 }}>{hint}</div>
      )}
      {children}
    </div>
  );
}

const chip: React.CSSProperties = {
  padding: "5px 11px",
  borderRadius: 999,
  fontSize: 13,
  cursor: "pointer",
  border: "1px solid #2f3742",
  background: "transparent",
  color: "#8b949e",
};
