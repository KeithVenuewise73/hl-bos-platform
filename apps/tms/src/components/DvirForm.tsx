"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PHASES,
  SEVERITY,
  newInspectionId,
  type Check,
  type CheckResult,
  type Phase,
} from "@hl-bos/tms";
import { fleetCall } from "@/lib/client.ts";

export interface DvirUnit {
  id: string;
  name: string;
  type: string;
  status: string;
  checklist: string[];
  pendingReviews: { inspection: string; defects: string; certification: string }[];
}

interface Answer {
  result?: CheckResult;
  level?: number;
  note?: string;
}

export function DvirForm({
  units,
  driverName,
}: {
  units: DvirUnit[];
  driverName: string;
}) {
  const router = useRouter();
  const [unitId, setUnitId] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("Pre-trip");
  const [odometer, setOdometer] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [signature, setSignature] = useState("");
  const [consent, setConsent] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ id: string; defects: number } | null>(null);

  const unit = units.find((u) => u.id === unitId);
  const needsReview = phase === "Pre-trip" && (unit?.pendingReviews.length ?? 0) > 0;
  const unanswered = unit ? unit.checklist.filter((i) => !answers[i]?.result) : [];
  const defectsIncomplete = Object.entries(answers).some(
    ([, a]) => a.result === "Defect" && (!a.level || !(a.note ?? "").trim()),
  );
  const ready =
    !!unit &&
    odometer !== "" &&
    Number(odometer) >= 0 &&
    unanswered.length === 0 &&
    !defectsIncomplete &&
    signature.trim() !== "" &&
    consent &&
    (!needsReview || reviewed);

  const defectCount = useMemo(
    () => Object.values(answers).filter((a) => a.result === "Defect").length,
    [answers],
  );

  if (units.length === 0) {
    return (
      <p className="rounded border border-dashed border-line p-4 text-sm text-muted">
        No vehicle is assigned to you. Ask your manager to assign one.
      </p>
    );
  }

  if (done) {
    return (
      <div
        data-testid="dvir-done"
        className="rounded-lg border border-line bg-panel p-5"
      >
        <h2 className="text-lg font-semibold">Inspection submitted</h2>
        <p className="mt-1 text-sm">
          {done.defects === 0
            ? "No defects reported."
            : `${done.defects} defect(s) reported — maintenance has been placed on notice in the defect queue.`}
        </p>
        <p className="mt-1 text-xs text-muted">
          No text message or e-mail was sent: notifications are not built yet.
        </p>
        <div className="mt-4 flex gap-3">
          <Link className="text-brand underline" href={`/inspections/${done.id}`}>
            View report
          </Link>
          <button
            className="text-brand underline"
            onClick={() => {
              setDone(null);
              setUnitId("");
              setAnswers({});
              setSignature("");
              setConsent(false);
              setOdometer("");
              setPhoto(null);
              setReviewed(false);
              router.refresh();
            }}
          >
            Inspect another vehicle
          </button>
        </div>
      </div>
    );
  }

  const set = (item: string, a: Answer) =>
    setAnswers((prev) => ({ ...prev, [item]: { ...prev[item], ...a } }));

  async function submit() {
    if (!unit) return;
    setBusy(true);
    setError("");
    const id = newInspectionId();
    try {
      let photoPath: string | undefined;
      if (photo) {
        const up = await fetch(`/api/photo?inspection=${encodeURIComponent(id)}`, {
          method: "POST",
          body: photo,
        });
        const body = (await up.json()) as { path?: string; error?: string };
        if (!up.ok) throw new Error(body.error ?? "Photo upload failed");
        photoPath = body.path;
      }
      const checks: Check[] = unit.checklist.map((item) => {
        const a = answers[item]!;
        return a.result === "Defect"
          ? { item, result: "Defect", level: a.level!, note: a.note!.trim() }
          : { item, result: a.result! };
      });
      await fleetCall("submit_inspection", {
        report: {
          id,
          asset: unit.id,
          phase,
          odometer: Number(odometer),
          inspectedAt: new Date().toISOString(),
          driver: driverName,
          signature: signature.trim(),
          consent: true,
          checks,
          ...(photoPath ? { photo: photoPath } : {}),
        },
        reviews: needsReview
          ? unit.pendingReviews.map((r) => ({ inspection: r.inspection }))
          : [],
      });
      setDone({ id, defects: checks.filter((c) => c.result === "Defect").length });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-panel p-4">
        <h2 className="mb-2 font-semibold">1. Vehicle</h2>
        <div className="grid gap-2">
          {units.map((u) => (
            <button
              key={u.id}
              data-pick={u.id}
              onClick={() => {
                setUnitId(u.id);
                setAnswers({});
              }}
              className={`flex items-center justify-between rounded border px-3 py-3 text-left ${unitId === u.id ? "border-brand bg-brand/5" : "border-line"}`}
            >
              <span>
                <b>{u.id}</b> {u.name}{" "}
                <span className="text-xs text-muted">· {u.type}</span>
              </span>
              <span
                className={`text-xs font-semibold ${u.status === "Out of service" ? "text-bad" : u.status === "Defect open" ? "text-warn" : "text-ok"}`}
              >
                {u.status}
              </span>
            </button>
          ))}
        </div>
        {unit?.status === "Out of service" ? (
          <p className="mt-2 rounded bg-red-50 p-2 text-sm text-bad">
            This vehicle is OUT OF SERVICE. Do not drive it until maintenance certifies
            the repair.
          </p>
        ) : null}
      </section>

      {unit ? (
        <>
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-2 font-semibold">2. Trip</h2>
            <div className="flex flex-wrap gap-2">
              {PHASES.map((p) => (
                <button
                  key={p}
                  data-phase={p}
                  onClick={() => setPhase(p)}
                  className={`rounded border px-3 py-2 text-sm ${phase === p ? "border-brand bg-brand text-white" : "border-line"}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-sm">
              Odometer
              <input
                data-testid="odometer"
                inputMode="numeric"
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </label>
          </section>

          {needsReview ? (
            <section
              data-testid="review-prior"
              className="rounded-lg border-2 border-accent bg-amber-50 p-4"
            >
              <h2 className="mb-2 font-semibold">
                Repairs since your last report — review before driving
              </h2>
              <ul className="mb-2 space-y-1 text-sm">
                {unit.pendingReviews.map((r) => (
                  <li key={r.inspection}>
                    <b>{r.defects}</b> — {r.certification}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-sm">
                <input
                  data-testid="ack-repairs"
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I have reviewed the previous report and the repair certification.
              </label>
            </section>
          ) : null}

          <section className="rounded-lg border border-line bg-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">
                3. Checklist{" "}
                <span className="text-xs text-muted">
                  ({unit.checklist.length} items)
                </span>
              </h2>
              <button
                data-testid="all-pass"
                className="text-sm text-brand underline"
                onClick={() =>
                  unit.checklist.forEach((i) => {
                    if (!answers[i]?.result) set(i, { result: "Pass" });
                  })
                }
              >
                Mark unanswered as Pass
              </button>
            </div>
            <ul className="divide-y divide-line">
              {unit.checklist.map((item) => {
                const a = answers[item] ?? {};
                return (
                  <li key={item} data-item={item} className="py-3">
                    <div className="mb-2 text-sm font-medium">{item}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Pass", "Defect", "Not applicable"] as const).map((r) => (
                        <button
                          key={r}
                          data-result={r}
                          onClick={() => set(item, { result: r })}
                          className={`rounded border px-2 py-2 text-xs ${a.result === r ? (r === "Defect" ? "border-bad bg-bad text-white" : "border-brand bg-brand text-white") : "border-line"}`}
                        >
                          {r === "Not applicable" ? "N/A" : r}
                        </button>
                      ))}
                    </div>
                    {a.result === "Defect" ? (
                      <div className="mt-2 space-y-2">
                        <select
                          data-testid="severity"
                          className="w-full rounded border border-line px-2 py-2 text-sm"
                          value={a.level ?? ""}
                          onChange={(e) => set(item, { level: Number(e.target.value) })}
                        >
                          <option value="">Severity…</option>
                          {SEVERITY.map((s) => (
                            <option key={s.level} value={s.level}>
                              {s.level} — {s.label}
                            </option>
                          ))}
                        </select>
                        <textarea
                          data-testid="defect-note"
                          maxLength={1500}
                          placeholder="Describe the defect"
                          className="w-full rounded border border-line px-2 py-2 text-sm"
                          value={a.note ?? ""}
                          onChange={(e) => set(item, { note: e.target.value })}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-2 font-semibold">
              4. Photo <span className="text-xs text-muted">(optional, JPEG)</span>
            </h2>
            <input
              data-testid="photo"
              type="file"
              accept="image/jpeg"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-2 font-semibold">5. Sign</h2>
            <input
              data-testid="signature"
              placeholder="Type your full name"
              className="w-full rounded border border-line px-3 py-2"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              maxLength={120}
            />
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input
                data-testid="consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I certify this inspection is accurate and I am signing it electronically.
            </label>
            {defectCount > 0 ? (
              <p className="mt-2 text-sm text-warn">
                {defectCount} defect(s) will be reported.
              </p>
            ) : null}
            {!ready ? (
              <p className="mt-2 text-xs text-muted">
                {unanswered.length > 0
                  ? `${unanswered.length} item(s) not answered. `
                  : ""}
                {defectsIncomplete
                  ? "Every defect needs a severity and description. "
                  : ""}
                {odometer === "" ? "Enter the odometer. " : ""}
              </p>
            ) : null}
            <button
              data-testid="submit-dvir"
              disabled={!ready || busy}
              onClick={() => void submit()}
              className="mt-3 w-full rounded bg-brand px-4 py-3 font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Submitting…" : "Submit inspection"}
            </button>
            {error ? (
              <p data-testid="dvir-error" className="mt-2 text-sm text-bad">
                {error}
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
