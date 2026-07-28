"use client";

import { useCallback, useEffect, useState } from "react";
import { INDUSTRY_PACKS } from "@hl-bos/bti-engine";
import { signOut } from "@/lib/auth";
import {
  fetchMyTenants,
  listBusinesses,
  registerBusiness,
  runAnalysis,
  saveAnalysis,
  fetchLatestAnalysis,
  SAMPLE_HTML,
  type TenantRef,
  type BusinessRow,
  type AnalysisView,
  type IntakeInput,
} from "@/lib/api";
import { Card, Badge, EmptyState, Field, scoreColor } from "@/components/ui";

type Pane = { kind: "welcome" } | { kind: "intake" } | { kind: "business"; id: string };

export default function Workspace({ email }: { email: string | null }) {
  const [tenants, setTenants] = useState<TenantRef[] | null>(null);
  const [tenant, setTenant] = useState<TenantRef | null>(null);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [pane, setPane] = useState<Pane>({ kind: "welcome" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshBusinesses = useCallback(async (t: TenantRef) => {
    setBusinesses(await listBusinesses(t.tenant_id));
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const ts = await fetchMyTenants();
        if (!active) return;
        setTenants(ts);
        const first = ts[0] ?? null;
        setTenant(first);
        if (first) setBusinesses(await listBusinesses(first.tenant_id));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("hl-bti-theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">HL</div>
          <div>
            <div className="brand-eyebrow">Herman Legacy</div>
            <div className="brand-name">Business Transformation Intelligence</div>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {tenant && <Badge kind="info">{tenant.name}</Badge>}
          <span className="dim sm">{email}</span>
          <button className="btn sm" onClick={toggleTheme}>
            ◐ Theme
          </button>
          <button className="btn sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {loading ? (
        <div className="content">
          <EmptyState title="Loading your workspace…" />
        </div>
      ) : tenants && tenants.length === 0 ? (
        <div className="content">
          <Card title="Access pending">
            <p>
              You are signed in as <strong>{email}</strong>, but your account is not yet
              a member of a Herman Legacy workspace with Business Transformation access.
              An administrator must add you to a tenant with the{" "}
              <code>bti.business.manage</code> permission.
            </p>
          </Card>
        </div>
      ) : (
        <div className="wsgrid">
          <aside className="wsside">
            <button
              className="btn primary"
              style={{ width: "100%", marginBottom: 12 }}
              onClick={() => setPane({ kind: "intake" })}
            >
              + New business
            </button>
            <div className="section-title">Businesses</div>
            {businesses.length === 0 ? (
              <div className="dim sm" style={{ padding: "8px 4px" }}>
                No businesses yet. Create your first one.
              </div>
            ) : (
              <div className="bizlist">
                {businesses.map((b) => (
                  <button
                    key={b.id}
                    className={`bizitem${pane.kind === "business" && pane.id === b.id ? " on" : ""}`}
                    onClick={() => setPane({ kind: "business", id: b.id })}
                  >
                    <div className="bizname">{b.name}</div>
                    <div className="dim sm">
                      {b.industry ?? "—"}
                      {b.latest
                        ? ` · analyzed (${b.latest.transformation_score ?? "—"}/100)`
                        : " · not analyzed"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <main className="wsmain">
            {error && (
              <div className="banner bdanger" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}
            {pane.kind === "welcome" && (
              <EmptyState icon="⚡" title="Select or create a business">
                Create a business record, then run the analysis to generate an executive
                blueprint and proposal — all saved to the Herman Legacy cloud.
              </EmptyState>
            )}
            {pane.kind === "intake" && tenant && (
              <Intake
                tenant={tenant}
                onCreated={async (id) => {
                  if (tenant) await refreshBusinesses(tenant);
                  setPane({ kind: "business", id });
                }}
                onError={setError}
              />
            )}
            {pane.kind === "business" && (
              <BusinessPane
                businessId={pane.id}
                business={businesses.find((b) => b.id === pane.id) ?? null}
                onSaved={async () => {
                  if (tenant) await refreshBusinesses(tenant);
                }}
                onError={setError}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

// ── Intake screen — every field the order requires ─────────────────────────
function Intake({
  tenant,
  onCreated,
  onError,
}: {
  tenant: TenantRef;
  onCreated: (id: string) => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [f, setF] = useState({
    name: "",
    website: "",
    industry: "general",
    location: "",
    primaryContact: "",
    email: "",
    phone: "",
    goals: "",
    analysisOnly: false,
  });
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function submit() {
    setBusy(true);
    onError("");
    try {
      const input: IntakeInput = {
        tenant: tenant.tenant_id,
        name: f.name,
        website: f.website,
        industry: f.industry,
        pack: f.industry,
        location: f.location,
        primaryContact: f.primaryContact,
        email: f.email,
        phone: f.phone,
        goals: f.goals,
        analysisOnly: f.analysisOnly,
      };
      const id = await registerBusiness(input);
      await onCreated(id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create the business.");
      setBusy(false);
    }
  }

  return (
    <Card title="New business">
      <div className="grid cols-2" style={{ gap: 12 }}>
        <Field label="Business name *">
          <input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Website">
          <input value={f.website} onChange={(e) => set("website", e.target.value)} />
        </Field>
        <Field label="Industry">
          <select value={f.industry} onChange={(e) => set("industry", e.target.value)}>
            {INDUSTRY_PACKS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <input value={f.location} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="Primary contact">
          <input
            value={f.primaryContact}
            onChange={(e) => set("primaryContact", e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={f.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Business goals">
          <input value={f.goals} onChange={(e) => set("goals", e.target.value)} />
        </Field>
      </div>
      <label
        className="row"
        style={{ gap: 8, margin: "4px 0 12px", cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={f.analysisOnly}
          onChange={(e) => set("analysisOnly", e.target.checked)}
        />
        <span className="sm">
          Analysis-only engagement (HL-BTI advises; no delivery — e.g. Venuewise)
        </span>
      </label>
      <div className="banner" style={{ marginBottom: 12 }}>
        📎 Optional document upload connects to Herman Legacy cloud storage once the
        storage bucket is provisioned; the field is intentionally hidden until then
        rather than shown as a control that does nothing.
      </div>
      <button
        className="btn primary"
        onClick={() => void submit()}
        disabled={busy || !f.name.trim()}
      >
        {busy ? "Creating…" : "Create business"}
      </button>
    </Card>
  );
}

// ── Business pane — run/view analysis, blueprint, proposal ─────────────────
function BusinessPane({
  businessId,
  business,
  onSaved,
  onError,
}: {
  businessId: string;
  business: BusinessRow | null;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [analysis, setAnalysis] = useState<AnalysisView | null>(null);
  const [dirty, setDirty] = useState(false);
  const [html, setHtml] = useState(SAMPLE_HTML);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // Keyed on the stable business id — NOT the business object. A parent list
  // refresh (e.g. after a save) hands us a new object with the same id; keying
  // on id keeps the loaded analysis and the "saved" confirmation in place
  // instead of wiping them on every refresh.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setAnalysis(null);
    setDirty(false);
    setSaved(false);
    void (async () => {
      try {
        const v = await fetchLatestAnalysis(businessId);
        if (active) setAnalysis(v);
      } catch (err) {
        if (active) onError(err instanceof Error ? err.message : "Load failed.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [businessId, onError]);

  if (!business) return <EmptyState title="Business not found" />;

  function run() {
    if (!business) return;
    setBusy(true);
    onError("");
    setTimeout(() => {
      try {
        const v = runAnalysis({
          name: business.name,
          website: business.website ?? "",
          industry: business.industry_pack ?? business.industry ?? "general",
          location: business.location ?? "",
          html,
        });
        setAnalysis(v);
        setDirty(true);
        setSaved(false);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Analysis failed.");
      } finally {
        setBusy(false);
      }
    }, 250);
  }

  async function save() {
    if (!business || !analysis) return;
    setBusy(true);
    try {
      await saveAnalysis(business.id, analysis);
      setDirty(false);
      setSaved(true);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <div className="row spread">
          <div>
            <h2 style={{ margin: 0 }}>{business.name}</h2>
            <div className="dim sm">
              {[business.website, business.industry, business.location]
                .filter(Boolean)
                .join(" · ") || "No details"}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" onClick={run} disabled={busy}>
              {busy ? "Analyzing…" : analysis ? "Re-run analysis" : "⚡ Run analysis"}
            </button>
            {analysis && dirty && (
              <button className="btn" onClick={() => void save()} disabled={busy}>
                💾 Save analysis
              </button>
            )}
            {analysis && !dirty && (
              <button className="btn" onClick={() => window.print()}>
                🖨 Export
              </button>
            )}
          </div>
        </div>
        {(business.primary_contact ||
          business.email ||
          business.phone ||
          business.goals) && (
          <table className="tbl" style={{ marginTop: 10 }}>
            <tbody>
              {business.primary_contact && (
                <tr>
                  <td className="dim" style={{ width: 140 }}>
                    Primary contact
                  </td>
                  <td>
                    {business.primary_contact}
                    {business.email ? ` · ${business.email}` : ""}
                    {business.phone ? ` · ${business.phone}` : ""}
                  </td>
                </tr>
              )}
              {business.goals && (
                <tr>
                  <td className="dim">Goals</td>
                  <td>{business.goals}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        <details style={{ marginTop: 10 }}>
          <summary className="dim sm" style={{ cursor: "pointer" }}>
            Website content for analysis (auto-filled with a demo site; paste the
            customer&rsquo;s homepage HTML for a live analysis)
          </summary>
          <textarea
            style={{
              marginTop: 8,
              minHeight: 110,
              width: "100%",
              fontFamily: "monospace",
              fontSize: 12,
            }}
            value={html}
            onChange={(e) => setHtml(e.target.value)}
          />
        </details>
        {saved && (
          <div className="banner ok" style={{ marginTop: 10 }}>
            ✓ Saved to the Herman Legacy cloud — this will reload on any device.
          </div>
        )}
      </Card>

      {loading ? null : !analysis ? (
        <div style={{ marginTop: 14 }}>
          <EmptyState icon="⚡" title="No analysis yet">
            Click <strong>Run analysis</strong> to generate findings, an executive
            blueprint, and a proposal.
          </EmptyState>
        </div>
      ) : (
        <Result analysis={analysis} />
      )}
    </>
  );
}

function Result({ analysis }: { analysis: AnalysisView }) {
  const t = analysis.transformationScore;
  return (
    <>
      <div className="section-title">Business Intelligence Profile</div>
      <Card>
        <div className="grid cols-2" style={{ gap: 10 }}>
          {analysis.profile.map((o, i) => (
            <div
              key={i}
              className="li"
              style={{ alignItems: "flex-start", flexDirection: "column" }}
            >
              <strong>{o.label}</strong>
              <span style={{ fontSize: 13.5 }}>{o.detail}</span>
              <span className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                Evidence: {o.evidence}
              </span>
            </div>
          ))}
        </div>
        <div className="banner" style={{ marginTop: 12 }}>
          ℹ {analysis.coverageNote}
        </div>
      </Card>

      <div className="section-title">Findings &amp; Herman Legacy Recommendations</div>
      <div className="list">
        {analysis.findings.map((f, i) => (
          <Card key={i}>
            <div className="row spread">
              <div>
                <strong style={{ fontSize: 15 }}>{f.label}</strong>
                <div className="dim sm">{f.finding}</div>
              </div>
              <div className="row">
                <Badge
                  kind={
                    f.priority === "critical"
                      ? "danger"
                      : f.priority === "high"
                        ? "warn"
                        : undefined
                  }
                >
                  {f.priority}
                </Badge>
                <Badge
                  kind={
                    f.confidence === "high"
                      ? "ok"
                      : f.confidence === "low"
                        ? "danger"
                        : undefined
                  }
                >
                  confidence: {f.confidence}
                </Badge>
                <Badge kind="info">Est. ROI: {f.roi}</Badge>
              </div>
            </div>
            <table className="tbl" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td className="dim" style={{ width: 150 }}>
                    Evidence
                  </td>
                  <td>
                    {f.evidence.map((e, j) => (
                      <div key={j}>{e}</div>
                    ))}
                  </td>
                </tr>
                <tr>
                  <td className="dim">Business Impact</td>
                  <td>{f.businessImpact}</td>
                </tr>
                <tr>
                  <td className="dim">Strategic Risk</td>
                  <td>{f.businessRisk}</td>
                </tr>
                <tr>
                  <td className="dim">Root Cause</td>
                  <td>{f.rootCause}</td>
                </tr>
                <tr>
                  <td className="dim">Recommended action</td>
                  <td>
                    {f.recommendedAction}{" "}
                    <span className="dim">
                      ({f.timeline}, {f.difficulty} effort)
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="dim">Herman Legacy solution</td>
                  <td>
                    {f.services.map((s) => (
                      <Badge key={s} kind="ok">
                        {s}
                      </Badge>
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>
        ))}
      </div>

      <div className="section-title">Executive Business Transformation Blueprint</div>
      <Card>
        <div className="row spread">
          <div
            className="dim sm"
            style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            Business Transformation Blueprint
          </div>
          {t !== null && (
            <div
              style={{ fontWeight: 700, color: scoreColor(t) }}
              title="internal composite"
            >
              Composite {t}/100
            </div>
          )}
        </div>
        <h2 style={{ fontSize: 22, marginTop: 4 }}>{analysis.businessName}</h2>
        <div style={{ marginTop: 12 }}>
          {analysis.narrative.map((s, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <strong>{s.title}</strong>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>{s.body}</div>
            </div>
          ))}
        </div>
        <div className="section-title">Recommended Herman Legacy Services</div>
        <div className="row" style={{ gap: 8 }}>
          {analysis.recommendedServices.map((s) => (
            <Badge key={s} kind="ok">
              {s}
            </Badge>
          ))}
        </div>
      </Card>

      <div className="section-title">Proposal</div>
      <Card title={`Proposal — ${analysis.businessName}`}>
        <table className="tbl" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Herman Legacy service</th>
              <th>Type</th>
              <th>Addresses</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {analysis.proposal.map((l, i) => (
              <tr key={i}>
                <td>
                  <strong>{l.service}</strong>
                </td>
                <td>
                  <Badge kind={l.type === "recurring" ? "info" : undefined}>
                    {l.type === "recurring" ? "Monthly" : "One-time"}
                  </Badge>
                </td>
                <td className="dim">{l.addresses.join(", ")}</td>
                <td className="dim">TBD</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="banner" style={{ marginTop: 10 }}>
          💡 Pricing is a CEO decision — set it before sending. HL-BTI never invents a
          price.
        </div>
      </Card>
    </>
  );
}
