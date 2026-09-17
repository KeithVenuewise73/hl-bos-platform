"use client";

import { useState } from "react";

import {
  campaigns,
  saveCampaign,
  type Agency,
  type Campaign,
  type Dimension,
} from "@/lib/api";
import { useAction, useAsync } from "@/lib/hooks";
import { Card, EmptyState, Field } from "@/components/ui";
import { Loaded, PageHead, Toast } from "@/components/parts";

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "google_business", label: "Google Business" },
  { key: "social", label: "Social" },
  { key: "competitor", label: "Competitors" },
];

/**
 * Screen 3 — campaigns.
 *
 * A campaign's weights decide what an audit is even capable of scoring:
 * start_run() refuses a campaign that weights nothing, and a dimension the
 * campaign does not weight cannot influence the composite even if something
 * scores it. The production campaign weights ONE dimension (website: 100),
 * which is why so many recorded runs read "1 of 1" — that is visible here
 * rather than buried.
 */
export default function Campaigns({ agency }: { agency: Agency }) {
  const state = useAsync(() => campaigns(agency.tenant_id), [agency.tenant_id]);
  const act = useAction();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [weights, setWeights] = useState<Record<string, number>>({ website: 100 });

  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  function save() {
    act.run(
      "Campaign saved.",
      () =>
        saveCampaign(
          agency.tenant_id,
          key.trim(),
          name.trim(),
          Object.fromEntries(Object.entries(weights).filter(([, v]) => v > 0)),
        ),
      () => {
        setKey("");
        setName("");
        state.reload();
      },
    );
  }

  return (
    <>
      <PageHead
        title="Campaigns"
        sub="A campaign is the rubric an audit is run against. Its weights are the only dimensions a run can score — anything unweighted is invisible to the composite even if it is assessed."
      />

      <div className="grid cols-2">
        <Card title="Existing campaigns">
          <Loaded
            state={state}
            isEmpty={(d: Campaign[]) => d.length === 0}
            empty={
              <EmptyState title="No campaigns yet">
                An audit cannot be started until one exists, because a run with no
                weighted dimensions could not be scored.
              </EmptyState>
            }
          >
            {(list) => (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Weights</th>
                    <th>Runs</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div className="dim" style={{ fontSize: 11.5 }}>
                          {c.key} · {c.status}
                        </div>
                      </td>
                      <td className="muted">
                        {Object.entries(c.weights)
                          .map(([d, w]) => `${d.replace(/_/g, " ")} ${w}`)
                          .join(" · ")}
                        {Object.keys(c.weights).length === 1 && (
                          <div className="dim" style={{ fontSize: 11 }}>
                            One dimension only — a run against this can never report
                            more than 1 of 1.
                          </div>
                        )}
                      </td>
                      <td>{c.runs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Loaded>
        </Card>

        <Card title="New or updated campaign">
          {!agency.can.manage_campaigns ? (
            <EmptyState title="You cannot manage campaigns">
              Your membership of {agency.name} does not carry
              transform_audit.campaign.manage, so this form is not shown.
            </EmptyState>
          ) : (
            <>
              <Field label="Key (lowercase, e.g. wny_q4)">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </Field>
              <Field label="Name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <div className="section-title">Weights</div>
              {DIMENSIONS.map((d) => (
                <Field key={d.key} label={d.label}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={weights[d.key] ?? 0}
                    onChange={(e) =>
                      setWeights((p) => ({
                        ...p,
                        [d.key]: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </Field>
              ))}
              <div className={total === 0 ? "banner bdanger" : "banner"}>
                {total === 0
                  ? "Every weight is zero. A campaign that weights no dimension is refused, because a run against it could not be scored."
                  : `Weights total ${total}. They are relative, not a percentage — a run reports coverage as "scored of possible".`}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn primary"
                  disabled={act.busy || !key.trim() || !name.trim() || total === 0}
                  onClick={save}
                >
                  {act.busy ? "Saving…" : "Save campaign"}
                </button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Toast notice={act.notice} onClose={act.clear} />
    </>
  );
}
