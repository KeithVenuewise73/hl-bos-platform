import { notFound } from "next/navigation";

import { isSiteVertical } from "@hl-bos/site-builder";

import {
  effectiveQualification,
  QUALIFICATION_LABELS,
  STAGE_TO_HLBOS,
  stageLabel,
  VERTICAL_LABELS,
  WEBSITE_STATUS_LABELS,
  type Finding,
} from "@hl-bos/presence-scanner";

import { Card, Row } from "@/components/ui";
import { BuildDemoButton } from "@/components/DemoControls";
import { LeadControls } from "@/components/LeadControls";
import { C, QUAL_COLOUR, scoreColour } from "@/components/presence-style";
import { FilePresenceRepository } from "@/lib/presence-store";
import { FileDraftRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<Finding["status"], [string, string]> = {
  present: ["Present", C.green],
  missing: ["Missing", C.red],
  not_found: ["Not found", C.yellow],
  blocked: ["Blocked", C.yellow],
  not_checked: ["Not checked", C.grey],
};

const SOURCE_TEXT: Record<Finding["source"], string> = {
  google_places: "Google Maps",
  website: "Website",
  import: "Imported list",
  reviewer: "Reviewer",
};

export default async function LeadCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [p, draft] = await Promise.all([
    new FilePresenceRepository().getProspect(id),
    new FileDraftRepository().getByProspect(id),
  ]);
  if (!p) notFound();
  const q = effectiveQualification(p.qualification);
  const rec = p.places?.record;
  const byKey = new Map(p.findings.map((f) => [f.key, f]));

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a
        href="/presence"
        style={{ color: C.link, fontSize: 13, textDecoration: "none" }}
      >
        ← Back to the Lead Board
      </a>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          margin: "12px 0 18px",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>{p.name}</h1>
          <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>
            {VERTICAL_LABELS[p.vertical]} · {p.address ?? p.market.label} ·{" "}
            <span style={{ color: QUAL_COLOUR[q] }}>{QUALIFICATION_LABELS[q]}</span> ·
            Stage: {stageLabel(p.stage)} (HL-BOS stage “{STAGE_TO_HLBOS[p.stage]}”)
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              lineHeight: 1,
              color: scoreColour(p.score.total),
            }}
          >
            {p.score.total}
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            Opportunity Score · {p.score.version}
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            evidence behind {p.score.checkedMax} of 100 points
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card
          title="Business"
          sub="Contact details. A reviewer's correction is marked and wins over every other source."
        >
          <Row
            k="Phone"
            v={`${p.corrections.phone ?? p.phone ?? "—"}${p.corrections.phone ? " (corrected)" : ""}`}
          />
          <Row
            k="Email"
            v={`${p.corrections.email ?? p.email ?? "—"}${p.corrections.email ? " (corrected)" : ""}`}
          />
          <Row
            k="Website"
            v={
              p.corrections.website === "none"
                ? "none (corrected)"
                : `${p.corrections.website ?? p.website ?? "—"}${p.corrections.website ? " (corrected)" : ""}`
            }
          />
          <Row k="Website status" v={WEBSITE_STATUS_LABELS[p.websiteStatus]} />
          <Row
            k="Market"
            v={`${p.market.label}${p.market.zip ? ` ${p.market.zip}` : ""} · ${p.market.radiusMiles} mi`}
          />
          <Row
            k="Distance from market centre"
            v={p.distanceMiles !== undefined ? `${p.distanceMiles} mi` : "not known"}
          />
          <Row
            k="First seen / last scanned"
            v={`${p.firstSeenAt.slice(0, 10)} / ${p.lastScannedAt.slice(0, 10)}`}
          />
        </Card>

        <Card
          title="Google listing"
          sub={
            p.places
              ? `Source: Google Maps. Observed ${p.places.observedAt.slice(0, 10)}; kept until ${p.places.expiresAt.slice(0, 10)} under Google's storage rules, then purged unless rescanned.`
              : p.placeId
                ? "Google data for this business has expired and was purged (Google's storage rules). Rescan from Google to see it again."
                : "This business was imported, not found through Google, so there is no Google data."
          }
        >
          {rec ? (
            <>
              <Row k="Category" v={rec.primaryTypeLabel ?? rec.primaryType ?? "—"} />
              <Row k="Status" v={rec.businessStatus ?? "not reported"} />
              <Row
                k="Rating"
                v={rec.rating !== undefined ? rec.rating.toFixed(1) : "no rating"}
              />
              <Row
                k="Reviews"
                v={rec.reviewCount ?? (rec.rating === undefined ? 0 : "—")}
              />
              <Row
                k="Hours listed"
                v={
                  rec.hasHours === undefined
                    ? "not checked"
                    : rec.hasHours
                      ? "yes"
                      : "no"
                }
              />
              <Row
                k="Photos"
                v={
                  rec.photoCount === undefined
                    ? "not checked"
                    : rec.photoCount === 10
                      ? "10+"
                      : rec.photoCount
                }
              />
              {rec.mapsUrl ? (
                <p style={{ margin: "10px 0 0", fontSize: 13 }}>
                  <a
                    href={rec.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: C.link }}
                  >
                    Open in Google Maps
                  </a>
                </p>
              ) : null}
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>
              No Google data held.
            </p>
          )}
        </Card>
      </div>

      <Card
        title="Why this score"
        sub="Each component, the points it awarded, and the rule and finding behind every point. “Not checked” means no evidence either way — it is not counted as zero."
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {p.score.components.map((c) => (
              <tr key={c.component} style={{ borderBottom: "1px solid #1c2128" }}>
                <td
                  style={{
                    padding: "9px 6px",
                    width: 210,
                    verticalAlign: "top",
                    fontWeight: 600,
                  }}
                >
                  {c.label}
                </td>
                <td
                  style={{
                    padding: "9px 6px",
                    width: 110,
                    verticalAlign: "top",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.status === "not_checked" ? (
                    <span style={{ color: C.grey }}>not checked</span>
                  ) : (
                    <>
                      <strong>{c.awarded}</strong> / {c.max}
                      {c.status === "partial" ? (
                        <div style={{ fontSize: 11, color: C.muted }}>
                          partly checked
                        </div>
                      ) : null}
                    </>
                  )}
                </td>
                <td style={{ padding: "9px 6px", verticalAlign: "top" }}>
                  {c.contributions.length ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {c.contributions.map((x) => (
                        <li key={x.ruleId}>
                          +{x.points} {x.label}{" "}
                          <span style={{ color: C.muted, fontSize: 11 }}>
                            [{x.ruleId}; evidence:{" "}
                            {x.findingKeys
                              .map((k) => byKey.get(k)?.label ?? k)
                              .join(", ")}
                            ]
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {c.note ? (
                    <div
                      style={{
                        color: C.muted,
                        fontSize: 12,
                        marginTop: c.contributions.length ? 4 : 0,
                      }}
                    >
                      {c.note}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title="Findings and evidence"
        sub="Everything observed, where it came from and when. “Not found” means not seen on the homepage — only the homepage is inspected."
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: C.muted, textAlign: "left" }}>
              <th style={{ padding: "6px" }}>Finding</th>
              <th style={{ padding: "6px" }}>Status</th>
              <th style={{ padding: "6px" }}>Evidence</th>
              <th style={{ padding: "6px" }}>Source</th>
              <th style={{ padding: "6px" }}>Observed</th>
              <th style={{ padding: "6px" }}>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {p.findings.map((f) => (
              <tr
                key={f.key}
                style={{ borderTop: "1px solid #1c2128", verticalAlign: "top" }}
              >
                <td style={{ padding: "7px 6px", fontWeight: 600 }}>{f.label}</td>
                <td
                  style={{
                    padding: "7px 6px",
                    color: STATUS_TEXT[f.status][1],
                    whiteSpace: "nowrap",
                  }}
                >
                  {STATUS_TEXT[f.status][0]}
                </td>
                <td
                  style={{
                    padding: "7px 6px",
                    color: "#c9d1d9",
                    wordBreak: "break-word",
                  }}
                >
                  {f.evidence}
                </td>
                <td style={{ padding: "7px 6px", whiteSpace: "nowrap" }}>
                  {SOURCE_TEXT[f.source]}
                </td>
                <td style={{ padding: "7px 6px", whiteSpace: "nowrap" }}>
                  {f.observedAt.slice(0, 10)}
                </td>
                <td style={{ padding: "7px 6px" }}>{f.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title="Suggested HLG services"
        sub="From the Business Transformation growth map (the same mapping the BTI analyst uses). Prices are pending — set by the CEO, not by this tool."
      >
        {p.services.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
            {p.services.map((s) => (
              <li key={s.dimension}>
                <strong>{s.service}</strong> — {s.priority} priority · price pending{" "}
                <span style={{ color: C.muted, fontSize: 12 }}>({s.rationale})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: C.muted }}>
            No gaps with enough evidence to suggest a service.
          </p>
        )}
      </Card>

      <Card
        title="Qualification"
        sub="Automatic checks. A reviewer can override the result; the override and its reason are kept in the history."
      >
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
          {p.qualification.checks.map((c) => (
            <li key={c.code}>
              <strong>{c.label}</strong>: {c.outcome} —{" "}
              <span style={{ color: C.muted }}>{c.detail}</span>
            </li>
          ))}
        </ul>
        {p.qualification.override ? (
          <p style={{ margin: "10px 0 0", fontSize: 13 }}>
            Reviewer override:{" "}
            <strong>{QUALIFICATION_LABELS[p.qualification.override.status]}</strong> —{" "}
            {p.qualification.override.note} ({p.qualification.override.by},{" "}
            {p.qualification.override.at.slice(0, 10)})
          </p>
        ) : null}
      </Card>

      <Card
        title="Review this lead"
        sub="Stage, notes, overrides and corrections. Every change is recorded below."
      >
        <LeadControls
          id={p.id}
          stage={p.stage}
          hasOverride={Boolean(p.qualification.override)}
        />
      </Card>

      <Card
        title="Demo site"
        sub="A private one-page demo built from this lead, for the owner to see. Nothing is published from here."
      >
        {!isSiteVertical(p.vertical) ? (
          <p style={{ margin: 0, fontSize: 13, color: C.muted }}>
            Demo templates exist for contractors, salons/barbers and restaurants/bars so
            far; this vertical comes later.
          </p>
        ) : draft ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            Version {draft.version},{" "}
            {draft.status === "approved" ? "approved" : "draft"}, built{" "}
            {draft.updatedAt.slice(0, 10)}.{" "}
            <a href={`/presence/${p.id}/demo`} style={{ color: C.link }}>
              Open the demo →
            </a>
          </p>
        ) : (
          <BuildDemoButton id={p.id} hasDraft={false} />
        )}
      </Card>

      <Card
        title="Next steps (not built yet)"
        sub="Shown so you know where this is going. Neither does anything yet — nothing is sent from here."
      >
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.9,
            color: C.muted,
          }}
        >
          <li>
            Draft Outreach — Phase 3: a draft for your approval. Nothing is sent
            automatically.
          </li>
          <li>
            Create Proposal — Phase 3: uses the existing HL-BOS proposals, once prices
            are set.
          </li>
        </ul>
      </Card>

      <Card
        title="History"
        sub="Every scan, stage move, note, override and correction, oldest first."
      >
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
          {p.audit.map((a, i) => (
            <li key={`${a.at}-${i}`}>
              <span style={{ color: C.muted }}>
                {a.at.slice(0, 16).replace("T", " ")}
              </span>{" "}
              · {a.by} · {a.action.replace(/_/g, " ")} — {a.detail}
            </li>
          ))}
        </ul>
        {p.notes.length ? (
          <>
            <h3 style={{ fontSize: 13, margin: "14px 0 6px" }}>Notes</h3>
            {p.notes.map((n, i) => (
              <p
                key={`${n.at}-${i}`}
                style={{ margin: "0 0 8px", fontSize: 13, whiteSpace: "pre-wrap" }}
              >
                <span style={{ color: C.muted, fontSize: 12 }}>
                  {n.at.slice(0, 10)} · {n.by}
                </span>
                <br />
                {n.text}
              </p>
            ))}
          </>
        ) : null}
      </Card>
    </main>
  );
}
