"use client";

import { useMemo, useState, useTransition } from "react";
import {
  matchCapabilities,
  deliverableNow,
  roadmap,
  type CapabilityOffer,
  type ShopStack,
} from "@/lib/capability-match";
import type { AnswerKey } from "@/lib/discovery-sql";
import { recordCall } from "@/app/shops/actions";
import type { ActionResult } from "@/app/actions";

/**
 * The discovery call, as one screen.
 *
 * Questions down the left, the opportunity assembling on the right as they are
 * answered. It is meant to be used WHILE ON THE PHONE, which drives every
 * decision here:
 *
 *   * three buttons per question -- Yes / No / Not asked -- because the third
 *     is a real answer and the commonest one. A checkbox would force every
 *     unasked question to read as "no".
 *   * nothing saves until Save is pressed, so a misheard answer can be changed
 *     without a round trip mid-sentence.
 *   * only the questions actually touched are sent, so a second call adds to
 *     the first rather than overwriting it.
 *   * the right-hand column recomputes on every click, so the person on the
 *     phone can see the pitch change as the shop answers.
 */

interface Question {
  key: Exclude<AnswerKey, "booking_platform" | "chairs" | "notes">;
  stack: keyof ShopStack;
  ask: string;
  /** What a "yes" means, when that is not obvious from the question. */
  hint?: string;
}

const QUESTIONS: readonly Question[] = [
  {
    key: "own_website",
    stack: "ownWebsite",
    ask: "Do you have a website of your own?",
    hint: "Their own domain — not a Booksy or GlossGenius page.",
  },
  {
    key: "online_booking",
    stack: "onlineBooking",
    ask: "Can someone book without phoning you?",
  },
  {
    key: "missed_call_handling",
    stack: "missedCallHandling",
    ask: "When you're mid-cut and the phone goes, what happens to that call?",
    hint: "Yes only if something actually catches it — voicemail they return, or a person.",
  },
  {
    key: "takes_walkins",
    stack: "takesWalkIns",
    ask: "Do you take walk-ins?",
  },
  {
    key: "client_records",
    stack: "clientRecords",
    ask: "Do you keep a record of a regular — what they had last time?",
    hint: "Anything written down. Not the barber's memory.",
  },
  {
    key: "review_process",
    stack: "reviewProcess",
    ask: "Do you ask customers for reviews, as a routine?",
  },
];

type Tri = boolean | null;

export function CallScreen({
  prospectId,
  shopName,
  phone,
  answeredAt,
  initial,
  catalog,
  initialNotes,
}: {
  prospectId: string;
  shopName: string;
  phone: string | null;
  answeredAt: string | null;
  initial: ShopStack;
  catalog: CapabilityOffer[];
  initialNotes: string;
}) {
  const [stack, setStack] = useState<ShopStack>(initial);
  const [notes, setNotes] = useState(initialNotes);
  // Only what has actually been touched is sent. An untouched question must
  // not overwrite what an earlier call established.
  const [touched, setTouched] = useState<Set<AnswerKey>>(new Set());
  const [result, setResult] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();

  const gaps = useMemo(() => matchCapabilities(stack, catalog), [stack, catalog]);
  const now = deliverableNow(gaps);
  const later = roadmap(gaps);

  function set(key: AnswerKey, stackKey: keyof ShopStack, value: unknown) {
    setStack((s) => ({ ...s, [stackKey]: value }));
    setTouched((t) => new Set(t).add(key));
    setResult(null);
  }

  function save() {
    const answers: Record<string, unknown> = {};
    for (const q of QUESTIONS) {
      if (touched.has(q.key)) answers[q.key] = stack[q.stack];
    }
    if (touched.has("booking_platform"))
      answers["booking_platform"] = stack.bookingPlatform;
    if (touched.has("chairs")) answers["chairs"] = stack.chairs;
    if (touched.has("notes")) answers["notes"] = notes;
    startSaving(async () => {
      const r = await recordCall(prospectId, answers);
      setResult(r);
      if (r.ok) setTouched(new Set());
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
        gap: 20,
      }}
    >
      {/* ------------------------------------------------------ the call --- */}
      <div>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "#8b949e" }}>
          {answeredAt === null
            ? "Nobody has spoken to this shop yet."
            : `Last updated ${new Date(answeredAt).toLocaleString()}.`}
        </p>
        {phone !== null && (
          <p
            style={{
              margin: "0 0 16px",
              fontSize: 20,
              fontWeight: 600,
              color: "#e6edf3",
            }}
          >
            <a
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
              style={{ color: "#58a6ff" }}
            >
              {phone}
            </a>
          </p>
        )}

        {QUESTIONS.map((q) => (
          <div key={q.key} style={{ margin: "0 0 18px" }}>
            <div style={{ fontSize: 15, color: "#e6edf3", marginBottom: 2 }}>
              {q.ask}
            </div>
            {q.hint !== undefined && (
              <div style={{ fontSize: 12, color: "#6e7681", marginBottom: 7 }}>
                {q.hint}
              </div>
            )}
            <TriToggle
              value={stack[q.stack] as Tri}
              onChange={(v) => set(q.key, q.stack, v)}
            />
          </div>
        ))}

        <Field label="What do they book on, if anything?">
          <input
            value={stack.bookingPlatform ?? ""}
            placeholder="Booksy, GlossGenius, Square, a book on the counter…"
            onChange={(e) =>
              set("booking_platform", "bookingPlatform", e.target.value || null)
            }
            style={inputStyle}
          />
        </Field>

        <Field label="How many chairs?">
          <input
            value={stack.chairs ?? ""}
            inputMode="numeric"
            placeholder="—"
            onChange={(e) => {
              const n = e.target.value.trim();
              set("chairs", "chairs", n === "" ? null : Number(n));
            }}
            style={{ ...inputStyle, width: 90 }}
          />
        </Field>

        <Field label="Anything else worth remembering">
          <textarea
            value={notes}
            rows={3}
            placeholder="The thing they actually complained about."
            onChange={(e) => {
              setNotes(e.target.value);
              setTouched((t) => new Set(t).add("notes"));
              setResult(null);
            }}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Field>

        <button
          onClick={save}
          disabled={saving || touched.size === 0}
          style={{
            marginTop: 6,
            padding: "10px 18px",
            borderRadius: 6,
            border: "1px solid #2f3742",
            background: touched.size === 0 ? "#161b22" : "#238636",
            color: touched.size === 0 ? "#6e7681" : "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: touched.size === 0 ? "default" : "pointer",
          }}
        >
          {saving
            ? "Saving…"
            : touched.size === 0
              ? "Nothing new to save"
              : `Save ${touched.size} answer${touched.size === 1 ? "" : "s"}`}
        </button>

        {result !== null && (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              color: result.ok ? "#3fb950" : "#f85149",
            }}
          >
            {result.ok ? "Saved." : `${result.headline} ${result.meaning}`}
          </p>
        )}
      </div>

      {/* ----------------------------------------------- the opportunity --- */}
      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, color: "#e6edf3" }}>
          What we can do for {shopName}
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#6e7681" }}>
          Updates as they answer. Nothing here is a promise the catalog cannot keep.
        </p>

        <GapList
          title="Available today"
          empty="Nothing yet — answer a question on the left."
          gaps={now}
          tone="#3fb950"
        />
        <GapList
          title="On the roadmap"
          empty="Nothing."
          gaps={later}
          tone="#8b949e"
          caveat="Not built yet. Show it as direction, never as something they can buy."
        />
      </div>
    </div>
  );
}

function GapList({
  title,
  gaps,
  empty,
  tone,
  caveat,
}: {
  title: string;
  gaps: ReturnType<typeof matchCapabilities>;
  empty: string;
  tone: string;
  caveat?: string;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: tone,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {caveat !== undefined && gaps.length > 0 && (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#6e7681" }}>{caveat}</p>
      )}
      {gaps.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#6e7681" }}>{empty}</p>
      ) : (
        gaps.map((g) => (
          <div
            key={g.capability}
            style={{
              border: "1px solid #21262d",
              borderLeft: `3px solid ${tone}`,
              borderRadius: 6,
              padding: "11px 13px",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3" }}>
              {g.name}
              {g.needsConfirming && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 400,
                    color: "#d29922",
                  }}
                >
                  ask them
                </span>
              )}
            </div>
            <p style={{ margin: "5px 0 0", fontSize: 13, color: "#8b949e" }}>
              {g.because}
            </p>
            <p style={{ margin: "5px 0 0", fontSize: 13, color: "#6e7681" }}>
              Recovers: {g.recovers}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Yes / No / Not asked.
 *
 * "Not asked" is not a null state to be tidied away -- it is the answer for
 * most questions on most calls, and the database stores it as a distinct fact.
 */
function TriToggle({ value, onChange }: { value: Tri; onChange: (v: Tri) => void }) {
  const opts: { v: Tri; label: string }[] = [
    { v: true, label: "Yes" },
    { v: false, label: "No" },
    { v: null, label: "Not asked" },
  ];
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={String(o.v)}
            onClick={() => onChange(o.v)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 13,
              cursor: "pointer",
              border: `1px solid ${on ? "#58a6ff" : "#2f3742"}`,
              background: on ? "#132b47" : "transparent",
              color: on ? "#c9e2ff" : "#8b949e",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: "0 0 16px" }}>
      <div style={{ fontSize: 15, color: "#e6edf3", marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #2f3742",
  background: "#0d1117",
  color: "#e6edf3",
  fontSize: 14,
  fontFamily: "inherit",
};
