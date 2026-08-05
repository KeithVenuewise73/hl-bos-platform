"use client";

import { useMemo, useState } from "react";
import {
  BTDI_SECTIONS,
  MULTI_FIELDS,
  confirmationMessage,
  type BtdiField,
  type BtdiValue,
} from "@/lib/btdi";
import { colors } from "@/components/ui";

function track(event: "transformation_intake_start" | "transformation_intake_submit") {
  try {
    void fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, path: window.location.pathname, props: {} }),
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid #d5dae1`,
  borderRadius: 8,
  fontSize: 15,
  padding: "11px 12px",
  marginTop: 4,
  fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = {
  fontSize: 13.5,
  color: "#3a434e",
  display: "block",
  marginBottom: 14,
  lineHeight: 1.4,
};

type Values = Record<string, BtdiValue>;

export function BusinessTransformationIntakeForm() {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState<{ ref: string; persisted: boolean } | null>(null);

  const sections = BTDI_SECTIONS;
  const total = sections.length;
  const current = sections[step]!;
  const isLast = step === total - 1;

  const requiredThisStep = useMemo(
    () => current.fields.filter((f) => f.required),
    [current],
  );

  function set(name: string, value: BtdiValue) {
    if (!started) {
      setStarted(true);
      track("transformation_intake_start");
    }
    setValues((v) => ({ ...v, [name]: value }));
  }

  function toggleMulti(name: string, option: string, checked: boolean) {
    setValues((v) => {
      const raw = v[name];
      const cur = Array.isArray(raw) ? raw : [];
      const next = checked ? [...cur, option] : cur.filter((o) => o !== option);
      return { ...v, [name]: next };
    });
  }

  function localStepErrors(): string[] {
    const errs: string[] = [];
    for (const f of requiredThisStep) {
      if (f.type === "consent") {
        if (values[f.name] !== true) errs.push(`Please confirm: ${f.label}`);
      } else {
        const v = values[f.name];
        if (typeof v !== "string" || !v.trim()) errs.push(`${f.label} is required.`);
      }
    }
    return errs;
  }

  function next() {
    const errs = localStepErrors();
    if (errs.length > 0) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    setStep((s) => Math.min(s + 1, total - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setErrors([]);
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    const errs = localStepErrors();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setBusy(true);
    setErrors([]);
    const payload = { ...values, source: sourceAttribution() };
    try {
      const res = await fetch("/api/business-transformation-intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as
        | { status: "received"; ref: string; nextStep: string; persisted: boolean }
        | { status: "invalid"; errors: string[] };
      setBusy(false);
      if (data.status === "received") {
        track("transformation_intake_submit");
        setDone({ ref: data.ref, persisted: data.persisted });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrors(data.errors);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setBusy(false);
      setErrors(["Something went wrong. Please try again or use the Contact page."]);
    }
  }

  if (done) {
    return (
      <div
        role="status"
        style={{
          background: "#fff",
          border: `1px solid #cfe3d4`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 680,
        }}
      >
        <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>Intake received</h2>
        <p style={{ fontSize: 15, color: "#3a434e", lineHeight: 1.55 }}>
          {confirmationMessage()}
        </p>
        <p style={{ fontSize: 13, color: "#5b6672", marginTop: 12 }}>
          Your reference: <strong>{done.ref}</strong>
        </p>
        {!done.persisted ? (
          <p style={{ fontSize: 12.5, color: "#8a6d1a", marginTop: 8 }}>
            Your intake is captured and a Herman Legacy Digital advisor will confirm it
            directly.
          </p>
        ) : null}
      </div>
    );
  }

  const pct = Math.round(((step + 1) / total) * 100);

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Progress */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12.5,
            color: colors.MUTED,
          }}
        >
          <span>
            Step {step + 1} of {total} — {current.title}
          </span>
          <span>{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Intake progress"
          style={{
            height: 6,
            background: "#e4e7ec",
            borderRadius: 999,
            marginTop: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{ width: `${pct}%`, height: "100%", background: colors.ACCENT }}
          />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isLast) void submit();
          else next();
        }}
        style={{
          background: "#fff",
          border: `1px solid #e4e7ec`,
          borderRadius: 12,
          padding: 22,
        }}
      >
        {/* Honeypot — visually hidden, not display:none, so bots that skip
            hidden fields still fill it. Real users never see it. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-9999px",
            top: "auto",
            height: 0,
            overflow: "hidden",
          }}
        >
          <label>
            Company website (leave blank)
            <input
              name="company_website_hp"
              tabIndex={-1}
              autoComplete="off"
              value={
                typeof values["company_website_hp"] === "string"
                  ? values["company_website_hp"]
                  : ""
              }
              onChange={(e) => set("company_website_hp", e.target.value)}
            />
          </label>
        </div>

        <h2 style={{ fontSize: 19, margin: "0 0 4px" }}>{current.title}</h2>
        {current.intro ? (
          <p
            style={{
              fontSize: 13.5,
              color: colors.MUTED,
              lineHeight: 1.5,
              marginTop: 0,
            }}
          >
            {current.intro}
          </p>
        ) : null}

        {errors.length > 0 ? (
          <ul
            role="alert"
            style={{
              color: "#b42318",
              fontSize: 13.5,
              background: "#fef3f2",
              borderRadius: 8,
              padding: "10px 14px 10px 28px",
              margin: "12px 0",
            }}
          >
            {errors.map((er) => (
              <li key={er}>{er}</li>
            ))}
          </ul>
        ) : null}

        <div style={{ marginTop: 14 }}>
          {current.fields.map((f) => (
            <Field
              key={f.name}
              field={f}
              values={values}
              set={set}
              toggleMulti={toggleMulti}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          {step > 0 ? (
            <button type="button" onClick={back} style={secondaryBtn}>
              Back
            </button>
          ) : null}
          <button type="submit" disabled={busy} style={primaryBtn}>
            {isLast ? (busy ? "Submitting…" : "Submit intake") : "Continue"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: colors.MUTED, marginTop: 12 }}>
          Fields marked <span style={{ color: "#b42318" }}>*</span> are required. Your
          answers are saved as you move between steps.
        </p>
      </form>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: colors.ACCENT,
  color: "#fff",
  border: "none",
  borderRadius: 9,
  fontSize: 15,
  padding: "12px 22px",
  cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  background: "#fff",
  color: colors.INK,
  border: `1px solid #d5dae1`,
  borderRadius: 9,
  fontSize: 15,
  padding: "12px 22px",
  cursor: "pointer",
};

function Field({
  field,
  values,
  set,
  toggleMulti,
}: {
  field: BtdiField;
  values: Values;
  set: (name: string, value: BtdiValue) => void;
  toggleMulti: (name: string, option: string, checked: boolean) => void;
}) {
  const v = values[field.name];
  const strv = typeof v === "string" ? v : "";
  const req = field.required ? (
    <span style={{ color: "#b42318" }} aria-hidden="true">
      {" "}
      *
    </span>
  ) : null;
  const optional =
    !field.required && field.type !== "consent" ? (
      <span style={{ color: "#8a94a0" }}> (optional)</span>
    ) : null;

  if (field.type === "consent") {
    return (
      <label
        style={{ ...labelStyle, display: "flex", gap: 10, alignItems: "flex-start" }}
      >
        <input
          type="checkbox"
          name={field.name}
          checked={v === true}
          required={field.required}
          onChange={(e) => set(field.name, e.target.checked)}
          style={{ marginTop: 3, width: 16, height: 16 }}
        />
        <span>
          {field.label}
          {req}
        </span>
      </label>
    );
  }

  if (field.type === "checkbox-group" && MULTI_FIELDS.has(field.name)) {
    const arr = Array.isArray(v) ? v : [];
    return (
      <fieldset style={{ border: "none", padding: 0, margin: "0 0 16px" }}>
        <legend style={{ fontSize: 13.5, color: "#3a434e", marginBottom: 6 }}>
          {field.label}
          {optional}
        </legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
          {(field.options ?? []).map((opt) => (
            <label
              key={opt}
              style={{ fontSize: 13.5, display: "flex", gap: 6, alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={arr.includes(opt)}
                onChange={(e) => toggleMulti(field.name, opt, e.target.checked)}
              />
              {opt}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === "select") {
    return (
      <label style={labelStyle}>
        {field.label}
        {req}
        {optional}
        <select
          name={field.name}
          required={field.required}
          value={strv}
          onChange={(e) => set(field.name, e.target.value)}
          style={inputStyle}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {field.help ? <Help text={field.help} /> : null}
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label style={labelStyle}>
        {field.label}
        {req}
        {optional}
        <textarea
          name={field.name}
          required={field.required}
          rows={3}
          value={strv}
          onChange={(e) => set(field.name, e.target.value)}
          style={inputStyle}
        />
        {field.help ? <Help text={field.help} /> : null}
      </label>
    );
  }

  const htmlType =
    field.type === "email"
      ? "email"
      : field.type === "tel"
        ? "tel"
        : field.type === "url"
          ? "url"
          : "text";
  return (
    <label style={labelStyle}>
      {field.label}
      {req}
      {optional}
      <input
        name={field.name}
        type={htmlType}
        required={field.required}
        placeholder={field.placeholder}
        value={strv}
        onChange={(e) => set(field.name, e.target.value)}
        style={inputStyle}
      />
      {field.help ? <Help text={field.help} /> : null}
    </label>
  );
}

function Help({ text }: { text: string }) {
  return (
    <span style={{ display: "block", fontSize: 12, color: "#8a94a0", marginTop: 3 }}>
      {text}
    </span>
  );
}
