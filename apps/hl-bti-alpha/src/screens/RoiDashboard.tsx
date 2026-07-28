"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { engagementById, businessById, recordRoi, realizeRoi } from "@/lib/store";
import { Card, Badge, EmptyState, Field } from "@/components/ui";

// ROI DASHBOARD — baseline → projected → realized. Realized values are only ever
// what was actually entered; nothing is inferred from the projection.
export default function RoiDashboard({ engagementId }: { engagementId: string }) {
  const { ws, update } = useWorkspace();
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [baseline, setBaseline] = useState("");
  const [projected, setProjected] = useState("");
  const e = engagementById(ws, engagementId)!;
  const b = businessById(ws, e.businessId)!;

  if (b.analysisOnly) {
    return (
      <EmptyState icon="🔒" title="ROI tracking disabled">
        {b.name} is analysis-only — HL-BTI does not track realized ROI.
      </EmptyState>
    );
  }

  function add() {
    if (!label.trim()) return;
    update((d) =>
      recordRoi(
        engagementById(d, engagementId)!,
        label.trim(),
        unit.trim(),
        Number(baseline) || 0,
        Number(projected) || 0,
      ),
    );
    setLabel("");
    setUnit("");
    setBaseline("");
    setProjected("");
  }
  function realize(metricId: string, value: string) {
    const v = Number(value);
    if (Number.isNaN(v)) return;
    update((d) => {
      const m = engagementById(d, engagementId)!.roi.find((x) => x.id === metricId);
      if (m) realizeRoi(m, v);
    });
  }

  const realizedTotal = e.roi
    .filter((m) => m.status === "realized")
    .reduce((n, m) => n + (m.realized ?? 0), 0);
  const projectedTotal = e.roi.reduce((n, m) => n + (m.projected ?? 0), 0);

  return (
    <div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="stat-label">Metrics tracked</div>
          <div className="stat-value">{e.roi.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Projected total</div>
          <div className="stat-value">
            {projectedTotal === 0 ? "—" : projectedTotal.toLocaleString()}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Realized total</div>
          <div className="stat-value">
            {realizedTotal === 0 ? "—" : realizedTotal.toLocaleString()}
          </div>
        </div>
      </div>

      <Card title="Record an ROI metric">
        <div className="grid cols-4" style={{ gap: 10 }}>
          <Field label="Metric">
            <input
              type="text"
              value={label}
              placeholder="Labor hours saved"
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label="Unit">
            <input
              type="text"
              value={unit}
              placeholder="hours/mo"
              onChange={(e) => setUnit(e.target.value)}
            />
          </Field>
          <Field label="Baseline">
            <input
              type="text"
              value={baseline}
              placeholder="0"
              onChange={(e) => setBaseline(e.target.value)}
            />
          </Field>
          <Field label="Projected">
            <input
              type="text"
              value={projected}
              placeholder="320"
              onChange={(e) => setProjected(e.target.value)}
            />
          </Field>
        </div>
        <button className="btn primary" onClick={add}>
          Add metric
        </button>
      </Card>

      {e.roi.length === 0 ? (
        <EmptyState icon="📈" title="No ROI metrics yet">
          Record a baseline and projection to begin tracking ROI.
        </EmptyState>
      ) : (
        <Card title="ROI metrics">
          <table className="tbl">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Baseline</th>
                <th>Projected</th>
                <th>Realized</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {e.roi.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.label} <span className="dim">{m.unit}</span>
                  </td>
                  <td>{m.baseline ?? "—"}</td>
                  <td>{m.projected ?? "—"}</td>
                  <td>{m.realized ?? "—"}</td>
                  <td>
                    <Badge
                      kind={
                        m.status === "realized"
                          ? "ok"
                          : m.status === "projected"
                            ? "info"
                            : undefined
                      }
                    >
                      {m.status}
                    </Badge>
                  </td>
                  <td>
                    <RealizeControl onRealize={(v) => realize(m.id, v)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function RealizeControl({ onRealize }: { onRealize: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="row" style={{ gap: 6 }}>
      <input
        type="text"
        value={v}
        placeholder="realized"
        style={{ width: 90 }}
        onChange={(e) => setV(e.target.value)}
      />
      <button
        className="btn sm"
        onClick={() => {
          onRealize(v);
          setV("");
        }}
      >
        Realize
      </button>
    </div>
  );
}
