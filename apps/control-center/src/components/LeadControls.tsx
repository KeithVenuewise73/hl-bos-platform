"use client";

import { useState, useTransition } from "react";

import { LEAD_STAGES, QUALIFICATION_LABELS } from "@hl-bos/presence-scanner/labels";
import type { LeadStage } from "@hl-bos/presence-scanner";

import { reviewPresenceLead } from "@/actions/presence";
import type { PresenceResult } from "@/lib/presence";

import { button, C, input, label } from "./presence-style";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid #1c2128", padding: "12px 0" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

export function LeadControls({
  id,
  stage,
  hasOverride,
}: {
  id: string;
  stage: LeadStage;
  hasOverride: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);

  const act = (fd: FormData) =>
    start(async () => {
      fd.set("id", id);
      setResult(await reviewPresenceLead(fd));
    });

  return (
    <div>
      {result ? (
        <div
          role="status"
          style={{
            marginBottom: 10,
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${result.ok ? "#2ea043" : C.red}`,
            fontSize: 13,
          }}
        >
          <strong>{result.headline}</strong>{" "}
          <span style={{ color: C.muted }}>{result.meaning}</span>
        </div>
      ) : null}

      <Section title="Lead stage">
        <form
          action={act}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr auto",
            gap: 8,
            alignItems: "end",
          }}
        >
          <input type="hidden" name="kind" value="stage" />
          <div>
            <label style={label} htmlFor="to">
              Move to
            </label>
            <select id="to" name="to" style={input} defaultValue="">
              <option value="" disabled>
                Currently {LEAD_STAGES.find((s) => s.key === stage)?.label}
              </option>
              {LEAD_STAGES.filter((s) => s.key !== stage).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="stage-note">
              Note (optional)
            </label>
            <input id="stage-note" name="note" style={input} />
          </div>
          <button type="submit" disabled={pending} style={button(true, pending)}>
            Move
          </button>
        </form>
      </Section>

      <Section title="Add a note">
        <form
          action={act}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            alignItems: "end",
          }}
        >
          <input type="hidden" name="kind" value="note" />
          <textarea
            name="text"
            rows={2}
            style={input}
            maxLength={2000}
            aria-label="Note"
          />
          <button type="submit" disabled={pending} style={button(false, pending)}>
            Save note
          </button>
        </form>
      </Section>

      <Section title="Override qualification">
        <form
          action={act}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr auto",
            gap: 8,
            alignItems: "end",
          }}
        >
          <input type="hidden" name="kind" value="override" />
          <div>
            <label style={label} htmlFor="status">
              Set to
            </label>
            <select id="status" name="status" style={input} defaultValue="qualified">
              {Object.entries(QUALIFICATION_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="ov-note">
              Reason (required)
            </label>
            <input id="ov-note" name="note" style={input} />
          </div>
          <button type="submit" disabled={pending} style={button(false, pending)}>
            Override
          </button>
        </form>
        {hasOverride ? (
          <form action={act} style={{ marginTop: 8 }}>
            <input type="hidden" name="kind" value="clear_override" />
            <button type="submit" disabled={pending} style={button(false, pending)}>
              Return to the automatic result
            </button>
          </form>
        ) : null}
      </Section>

      <Section title="Correct a detail">
        <form
          action={act}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr auto",
            gap: 8,
            alignItems: "end",
          }}
        >
          <input type="hidden" name="kind" value="correct" />
          <div>
            <label style={label} htmlFor="field">
              Field
            </label>
            <select id="field" name="field" style={input} defaultValue="website">
              <option value="website">Website (re-inspects it)</option>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div>
            <label style={label} htmlFor="value">
              Correct value — “none” for no website
            </label>
            <input id="value" name="value" style={input} />
          </div>
          <button type="submit" disabled={pending} style={button(false, pending)}>
            Correct
          </button>
        </form>
      </Section>

      <Section title="Re-inspect">
        <form action={act}>
          <input type="hidden" name="kind" value="rescan" />
          <button type="submit" disabled={pending} style={button(false, pending)}>
            {pending ? "Working…" : "Re-inspect the website now"}
          </button>
          <span style={{ marginLeft: 10, fontSize: 12, color: C.muted }}>
            Uses the stored Google data; does not call Google.
          </span>
        </form>
      </Section>
    </div>
  );
}
