"use client";

import { useState, useTransition } from "react";
import {
  createProposal,
  decideProposal,
  saveProposal,
  sendProposal,
} from "@/app/shops/actions";
import type { ActionResult } from "@/app/actions";
import type { ProposalDocument } from "@/lib/proposal-doc";

/**
 * Every control on the proposal screens that actually changes something.
 *
 * Grouped in one client component so there is one place where an action's
 * result is shown, and one shape for showing it. A button that silently
 * succeeds or silently fails is the failure mode these screens exist to avoid.
 */

function Result({ r }: { r: ActionResult | null }) {
  if (r === null) return null;
  return (
    <p
      style={{ margin: "10px 0 0", fontSize: 13, color: r.ok ? "#3fb950" : "#f85149" }}
    >
      {r.ok ? r.headline : `${r.headline} ${r.meaning}`}
      {r.ok && r.meaning !== "" ? ` ${r.meaning}` : ""}
    </p>
  );
}

const btn = (enabled: boolean, tone = "#238636"): React.CSSProperties => ({
  padding: "10px 18px",
  borderRadius: 6,
  border: "1px solid #2f3742",
  background: enabled ? tone : "#161b22",
  color: enabled ? "#fff" : "#6e7681",
  fontSize: 14,
  fontWeight: 600,
  cursor: enabled ? "pointer" : "default",
});

export function CreateDraft({
  prospectId,
  blocked,
}: {
  prospectId: string;
  blocked: string | null;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, start] = useTransition();

  // A button that cannot do its job is worse than no button: it reads as an
  // offer. When there is nothing to propose, say so instead.
  if (blocked !== null) {
    return <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>{blocked}</p>;
  }
  return (
    <div>
      <button
        disabled={busy}
        style={btn(!busy)}
        onClick={() => start(async () => setResult(await createProposal(prospectId)))}
      >
        {busy ? "Freezing…" : "Create draft"}
      </button>
      <Result r={result} />
    </div>
  );
}

export function ProposalEditor({
  prospectId,
  proposalId,
  document: doc,
}: {
  prospectId: string;
  proposalId: string;
  document: ProposalDocument;
}) {
  const [message, setMessage] = useState(doc.message);
  const [note, setNote] = useState(doc.investment.note);
  const [lines, setLines] = useState(doc.investment.lines);
  const [steps, setSteps] = useState(doc.next_steps.join("\n"));
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, start] = useTransition();

  function save() {
    start(async () =>
      setResult(
        await saveProposal(prospectId, proposalId, {
          message,
          investment: {
            // An empty label is not a price line; it is a half-typed row.
            lines: lines.filter((l) => l.label.trim() !== ""),
            note,
          },
          nextSteps: steps
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s !== ""),
        }),
      ),
    );
  }

  return (
    <div>
      <Field
        label="Covering note"
        hint="The first thing they read. Their words from the call work better than ours."
      >
        <textarea
          value={message}
          rows={4}
          onChange={(e) => setMessage(e.target.value)}
          style={{ ...input, resize: "vertical" }}
        />
      </Field>

      <Field
        label="Investment"
        hint="Typed by you. Nothing here is calculated, and a document with no lines says pricing is not stated rather than inventing one."
      >
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              value={l.label}
              placeholder="What it is"
              onChange={(e) =>
                setLines(
                  lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                )
              }
              style={{ ...input, flex: 1 }}
            />
            <input
              value={l.amount}
              placeholder="$0"
              onChange={(e) =>
                setLines(
                  lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                )
              }
              style={{ ...input, width: 120 }}
            />
            <select
              value={l.cadence}
              onChange={(e) =>
                setLines(
                  lines.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          cadence: e.target.value === "monthly" ? "monthly" : "once",
                        }
                      : x,
                  ),
                )
              }
              style={{ ...input, width: 110 }}
            >
              <option value="once">One-off</option>
              <option value="monthly">Monthly</option>
            </select>
            <button
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
              style={{ ...btn(true, "#21262d"), padding: "8px 12px", fontWeight: 400 }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            setLines([...lines, { label: "", amount: "", cadence: "once" }])
          }
          style={{ ...btn(true, "#21262d"), padding: "8px 14px", fontSize: 13 }}
        >
          Add a line
        </button>
        <input
          value={note}
          placeholder="Anything that qualifies the pricing"
          onChange={(e) => setNote(e.target.value)}
          style={{ ...input, marginTop: 10 }}
        />
      </Field>

      <Field label="What happens next" hint="One step per line.">
        <textarea
          value={steps}
          rows={4}
          onChange={(e) => setSteps(e.target.value)}
          style={{ ...input, resize: "vertical" }}
        />
      </Field>

      <button disabled={busy} style={btn(!busy)} onClick={save}>
        {busy ? "Saving…" : "Save draft"}
      </button>
      <Result r={result} />
    </div>
  );
}

export function SendProposal({
  prospectId,
  proposalId,
}: {
  prospectId: string;
  proposalId: string;
}) {
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, start] = useTransition();

  return (
    <div>
      {!armed ? (
        <button style={btn(true, "#1f6feb")} onClick={() => setArmed(true)}>
          Mark as sent
        </button>
      ) : (
        <div>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#e6edf3" }}>
            This freezes the document. Nothing in it can change afterwards — a
            correction means a new proposal, which is also what the shop will have in
            their inbox.
          </p>
          <button
            disabled={busy}
            style={btn(!busy, "#1f6feb")}
            onClick={() =>
              start(async () => setResult(await sendProposal(prospectId, proposalId)))
            }
          >
            {busy ? "Recording…" : "Yes, it has gone out"}
          </button>
          <button
            onClick={() => setArmed(false)}
            style={{ ...btn(true, "#21262d"), marginLeft: 8, fontWeight: 400 }}
          >
            Not yet
          </button>
        </div>
      )}
      <Result r={result} />
    </div>
  );
}

export function RecordOutcome({
  prospectId,
  proposalId,
}: {
  prospectId: string;
  proposalId: string;
}) {
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, start] = useTransition();

  const decide = (status: string) =>
    start(async () =>
      setResult(await decideProposal(prospectId, proposalId, status, note)),
    );

  return (
    <div>
      <input
        value={note}
        placeholder="What they actually said"
        onChange={(e) => setNote(e.target.value)}
        style={{ ...input, marginBottom: 10 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={busy} style={btn(!busy)} onClick={() => decide("accepted")}>
          Accepted
        </button>
        <button
          disabled={busy}
          style={btn(!busy, "#21262d")}
          onClick={() => decide("declined")}
        >
          Declined
        </button>
        <button
          disabled={busy}
          style={btn(!busy, "#21262d")}
          onClick={() => decide("withdrawn")}
        >
          Withdrawn
        </button>
      </div>
      <Result r={result} />
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
    <div style={{ margin: "0 0 20px" }}>
      <div style={{ fontSize: 15, color: "#e6edf3", marginBottom: 2 }}>{label}</div>
      {hint !== undefined && (
        <div style={{ fontSize: 12, color: "#6e7681", marginBottom: 7 }}>{hint}</div>
      )}
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #2f3742",
  background: "#0d1117",
  color: "#e6edf3",
  fontSize: 14,
  fontFamily: "inherit",
};
