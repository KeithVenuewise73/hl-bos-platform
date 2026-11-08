"use client";

import { useState, useEffect, useRef } from "react";
import type { IntakeKind } from "@/lib/intake";

function track(event: string, props: Record<string, string> = {}) {
  try {
    void fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, path: window.location.pathname, props }),
      keepalive: true,
    });
  } catch {
    /* analytics is best-effort; never blocks the user */
  }
}

function sourceAttribution(): Record<string, string> {
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = { path: window.location.pathname };
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "ref"]) {
    const v = p.get(k);
    if (v) out[k] = v;
  }
  if (document.referrer) out["referrer"] = document.referrer;
  return out;
}

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d5dae1",
  borderRadius: 8,
  fontSize: 14,
  padding: "10px 12px",
  marginTop: 4,
  fontFamily: "inherit",
};
const label: React.CSSProperties = {
  fontSize: 13,
  color: "#3a434e",
  display: "block",
  marginBottom: 10,
};

export function IntakeForm({ kind }: { kind: IntakeKind }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ref: string; nextStep: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  // One id per visit: a retry after a failed send is recognisably the same
  // inquiry, so the destination can avoid storing it twice.
  const submissionId = useRef<string | null>(null);

  useEffect(() => {
    track(
      kind === "visibility_assessment" ? "assessment_start" : "consultation_request",
      {
        stage: "start",
      },
    );
  }, [kind]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const str = (name: string): string => {
      const v = form.get(name);
      return typeof v === "string" ? v : "";
    };
    submissionId.current ??= crypto.randomUUID();
    const payload = {
      submissionId: submissionId.current,
      kind,
      businessName: str("businessName"),
      website: str("website"),
      industry: str("industry"),
      contactName: str("contactName"),
      email: str("email"),
      phone: str("phone"),
      goals: str("goals"),
      challenges: str("challenges"),
      consent: form.get("consent") === "on",
      source: sourceAttribution(),
    };
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as
        | { status: "received"; ref: string; nextStep: string }
        | { status: "not_delivered"; message: string }
        | { status: "invalid"; errors: string[] };
      setBusy(false);
      if (data.status === "received") {
        setDone({ ref: data.ref, nextStep: data.nextStep });
        track(
          kind === "visibility_assessment"
            ? "assessment_submit"
            : "consultation_request",
          {
            stage: "submit",
          },
        );
      } else if (data.status === "not_delivered") {
        setErrors([data.message]);
      } else {
        setErrors(data.errors);
      }
    } catch {
      setBusy(false);
      setErrors([
        "We could not send your request, so it has not been received. Please try again in a few minutes.",
      ]);
    }
  }

  if (done) {
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #cfe3d4",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h3 style={{ margin: "0 0 8px" }}>Request received</h3>
        <p style={{ fontSize: 14, color: "#3a434e", lineHeight: 1.5 }}>
          {done.nextStep}
        </p>
        <p style={{ fontSize: 12.5, color: "#5b6672" }}>
          Reference: <strong>{done.ref}</strong>
        </p>
        <p style={{ fontSize: 11.5, color: "#5b6672" }}>
          No automated assessment has run — a Herman Legacy advisor reviews every
          request.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      style={{
        background: "#fff",
        border: "1px solid #e4e7ec",
        borderRadius: 12,
        padding: 20,
        maxWidth: 640,
      }}
    >
      <label style={label}>
        Business name *
        <input name="businessName" required style={input} />
      </label>
      <label style={label}>
        Website
        <input name="website" placeholder="https://" style={input} />
      </label>
      <label style={label}>
        Industry
        <input name="industry" style={input} />
      </label>
      <label style={label}>
        Contact name *
        <input name="contactName" required style={input} />
      </label>
      <label style={label}>
        Email *
        <input name="email" type="email" required style={input} />
      </label>
      <label style={label}>
        Phone
        <input name="phone" style={input} />
      </label>
      <label style={label}>
        Your business goals
        <textarea name="goals" rows={3} style={input} />
      </label>
      <label style={label}>
        Primary challenges
        <textarea name="challenges" rows={3} style={input} />
      </label>
      <label style={{ ...label, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input name="consent" type="checkbox" required style={{ marginTop: 3 }} />
        <span>
          I consent to Herman Legacy Digital contacting me about my request and
          acknowledge the privacy policy. *
        </span>
      </label>
      {errors.length > 0 ? (
        <ul role="alert" style={{ color: "#b42318", fontSize: 13 }}>
          {errors.map((er) => (
            <li key={er}>{er}</li>
          ))}
        </ul>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        style={{
          background: "#1f5f8b",
          color: "#fff",
          border: "none",
          borderRadius: 9,
          fontSize: 14,
          padding: "11px 18px",
          cursor: "pointer",
        }}
      >
        {busy ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
