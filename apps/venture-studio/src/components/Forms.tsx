"use client";
import { useState } from "react";

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0d1117",
  border: "1px solid #232a33",
  borderRadius: 8,
  color: "#e6edf3",
  padding: "9px 11px",
  marginTop: 4,
  fontSize: 13.5,
  fontFamily: "inherit",
};
const label: React.CSSProperties = {
  fontSize: 12.5,
  color: "#8b949e",
  display: "block",
  marginBottom: 10,
};
const btn: React.CSSProperties = {
  background: "#4493f8",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 13.5,
  cursor: "pointer",
};

function useSubmit(url: string, onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function post(body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        errors?: string[];
        provisioning?: string;
      };
      setBusy(false);
      if (res.ok && data.ok) {
        setMsg({ ok: true, text: "Saved." });
        onDone?.();
        return true;
      }
      if (data.provisioning && data.provisioning !== "ready") {
        setMsg({
          ok: false,
          text: "Captured request could not be persisted yet — the Venture Studio schema is pending CEO-approved migration. Nothing was fabricated.",
        });
        return false;
      }
      setMsg({
        ok: false,
        text: (data.errors ?? [data.error ?? "Something went wrong."]).join(" "),
      });
      return false;
    } catch {
      setBusy(false);
      setMsg({ ok: false, text: "Network error." });
      return false;
    }
  }
  return { busy, msg, post };
}

function Note({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p style={{ fontSize: 12.5, color: msg.ok ? "#3fb950" : "#d29922", marginTop: 10 }}>
      {msg.text}
    </p>
  );
}

export function NewOpportunityForm() {
  const { busy, msg, post } = useSubmit("/api/opportunities");
  const [errors, setErrors] = useState<string[]>([]);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    const f = new FormData(e.currentTarget);
    const g = (n: string): string => {
      const v = f.get(n);
      return typeof v === "string" ? v : "";
    };
    const body = {
      title: g("title"),
      summary: g("summary"),
      industry: g("industry"),
      opportunity_type: g("opportunity_type") || null,
      source_url: g("source_url") || null,
      initial_hypothesis: g("initial_hypothesis"),
      related_product: g("related_product") || null,
      tags: g("tags")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      is_demonstration: f.get("is_demonstration") === "on",
    };
    const ok = await post(body);
    if (ok) (e.target as HTMLFormElement).reset();
  }
  return (
    <form onSubmit={(e) => void onSubmit(e)} style={{ maxWidth: 640 }}>
      <label style={label}>
        Title *<input name="title" required style={input} />
      </label>
      <label style={label}>
        One-line summary
        <input name="summary" style={input} />
      </label>
      <label style={label}>
        Problem statement
        <textarea name="problem_statement" rows={2} style={input} />
      </label>
      <label style={label}>
        Industry
        <input name="industry" style={input} />
      </label>
      <label style={label}>
        Opportunity type
        <select name="opportunity_type" style={input}>
          <option value="">—</option>
          <option value="greenfield_product">Greenfield product</option>
          <option value="feature_expansion">Feature expansion</option>
          <option value="acquisition_target">Acquisition target</option>
          <option value="partnership">Partnership</option>
          <option value="open_source_leverage">Open-source leverage</option>
          <option value="research_to_product">Research → product</option>
          <option value="market_gap">Market gap</option>
        </select>
      </label>
      <label style={label}>
        Source URL
        <input name="source_url" placeholder="https://" style={input} />
      </label>
      <label style={label}>
        Initial hypothesis
        <textarea name="initial_hypothesis" rows={2} style={input} />
      </label>
      <label style={label}>
        Related Herman Legacy product (key)
        <input
          name="related_product"
          placeholder="e.g. herman-legacy-digital"
          style={input}
        />
      </label>
      <label style={label}>
        Tags (comma-separated)
        <input name="tags" style={input} />
      </label>
      <label style={{ ...label, display: "flex", gap: 8, alignItems: "center" }}>
        <input name="is_demonstration" type="checkbox" /> Mark as DEMONSTRATION / NOT
        LIVE EXTERNAL INTELLIGENCE
      </label>
      {errors.length ? (
        <ul style={{ color: "#f85149", fontSize: 13 }}>
          {errors.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      <button type="submit" disabled={busy} style={btn}>
        {busy ? "Saving…" : "Capture opportunity"}
      </button>
      <Note msg={msg} />
    </form>
  );
}

export function EvidenceForm({ opportunityId }: { opportunityId: string }) {
  const { busy, msg, post } = useSubmit(`/api/opportunities/${opportunityId}/evidence`);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (n: string): string => {
      const v = f.get(n);
      return typeof v === "string" ? v : "";
    };
    const ok = await post({
      evidence_type: g("evidence_type"),
      title: g("title"),
      source_url: g("source_url") || null,
      source_name: g("source_name"),
      excerpt: g("excerpt"),
      reliability: g("reliability"),
      relevance: g("relevance"),
    });
    if (ok) (e.target as HTMLFormElement).reset();
  }
  return (
    <form onSubmit={(e) => void onSubmit(e)} style={{ maxWidth: 640 }}>
      <label style={label}>
        Evidence type *
        <select name="evidence_type" required style={input}>
          <option value="verified_fact">Verified fact</option>
          <option value="external_claim">External claim</option>
          <option value="estimate">Estimate</option>
          <option value="inference">Inference</option>
          <option value="ceo_note">CEO note</option>
        </select>
      </label>
      <label style={label}>
        Title *<input name="title" required style={input} />
      </label>
      <label style={label}>
        Source name
        <input name="source_name" style={input} />
      </label>
      <label style={label}>
        Source URL
        <input name="source_url" placeholder="https://" style={input} />
      </label>
      <label style={label}>
        Excerpt / summary
        <textarea name="excerpt" rows={2} style={input} />
      </label>
      <label style={label}>
        Reliability
        <select name="reliability" style={input}>
          <option value="unverified">Unverified</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label style={label}>
        Relevance
        <select name="relevance" style={input}>
          <option value="supporting">Supporting</option>
          <option value="direct">Direct</option>
          <option value="tangential">Tangential</option>
        </select>
      </label>
      <button type="submit" disabled={busy} style={btn}>
        {busy ? "Saving…" : "Attach evidence"}
      </button>
      <Note msg={msg} />
    </form>
  );
}

export function DecisionForm({ opportunityId }: { opportunityId: string }) {
  const { busy, msg, post } = useSubmit(`/api/opportunities/${opportunityId}/decision`);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (n: string): string => {
      const v = f.get(n);
      return typeof v === "string" ? v : "";
    };
    await post({
      decision: g("decision"),
      rationale: g("rationale"),
      conditions: g("conditions"),
    });
  }
  return (
    <form onSubmit={(e) => void onSubmit(e)} style={{ maxWidth: 640 }}>
      <p style={{ fontSize: 12.5, color: "#d29922" }}>
        This is the authoritative CEO decision — distinct from any AI recommendation.
        Only the CEO role may record it.
      </p>
      <label style={label}>
        Decision *
        <select name="decision" required style={input}>
          <option value="build">Build</option>
          <option value="buy">Buy</option>
          <option value="partner">Partner</option>
          <option value="watch">Watch</option>
          <option value="ignore">Ignore</option>
          <option value="defer">Defer</option>
        </select>
      </label>
      <label style={label}>
        Rationale
        <textarea name="rationale" rows={2} style={input} />
      </label>
      <label style={label}>
        Conditions
        <textarea name="conditions" rows={2} style={input} />
      </label>
      <button type="submit" disabled={busy} style={btn}>
        {busy ? "Recording…" : "Record CEO decision"}
      </button>
      <Note msg={msg} />
    </form>
  );
}
