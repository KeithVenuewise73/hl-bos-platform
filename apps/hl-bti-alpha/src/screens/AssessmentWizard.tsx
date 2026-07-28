"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import {
  engagementById,
  assessmentProgress,
  setRating,
  setDomainNote,
  addEvidence,
  completeAssessment,
} from "@/lib/store";
import { DOMAINS } from "@hl-bos/bti-engine";
import { Card, Badge, Progress } from "@/components/ui";

// ASSESSMENT WIZARD — guided, one section (domain) at a time. Save/resume is
// automatic (every rating persists to the local workspace). Progress, assessor
// notes and evidence attachments are supported.
export default function AssessmentWizard({ engagementId }: { engagementId: string }) {
  const { ws, update } = useWorkspace();
  const [step, setStep] = useState(0);
  const [evidence, setEvidence] = useState("");
  const e = engagementById(ws, engagementId)!;
  const domain = DOMAINS[step]!;
  const prog = assessmentProgress(e.assessment);
  const ratings = e.assessment.ratings[domain.key] ?? {};
  const note = e.assessment.notes[domain.key] ?? "";

  function rate(dim: string, value: number) {
    update((d) => setRating(engagementById(d, engagementId)!, domain.key, dim, value));
  }
  function saveNote(value: string) {
    update((d) => setDomainNote(engagementById(d, engagementId)!, domain.key, value));
  }
  function attach() {
    if (!evidence.trim()) return;
    update((d) =>
      addEvidence(engagementById(d, engagementId)!, domain.key, "", evidence.trim()),
    );
    setEvidence("");
  }
  function finish() {
    update((d) => completeAssessment(engagementById(d, engagementId)!));
  }

  const domainEvidence = e.assessment.evidence.filter((x) => x.domain === domain.key);
  const allRated = prog.rated === prog.total;

  return (
    <div>
      <Card>
        <div className="row spread">
          <div>
            <div className="dim" style={{ fontSize: 12 }}>
              Assessment progress
            </div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {prog.rated} / {prog.total} dimensions
            </div>
          </div>
          <div className="row">
            {e.assessment.completed ? (
              <Badge kind="ok">Completed</Badge>
            ) : (
              <Badge kind="warn">In progress · autosaved</Badge>
            )}
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Progress pct={Math.round((prog.rated / prog.total) * 100)} />
        </div>
      </Card>

      {/* domain stepper */}
      <div className="row" style={{ gap: 6, margin: "16px 0", flexWrap: "wrap" }}>
        {DOMAINS.map((d, i) => {
          const p = prog.perDomain[d.key];
          const done = p.rated === p.total;
          return (
            <button
              key={d.key}
              className={`btn sm${i === step ? " primary" : ""}`}
              onClick={() => setStep(i)}
              title={`${p.rated}/${p.total}`}
            >
              {done ? "✓ " : ""}
              {d.name.replace(" Intelligence", "")}
            </button>
          );
        })}
      </div>

      <Card title={domain.name}>
        <div className="dim" style={{ fontSize: 13, marginBottom: 12 }}>
          {domain.description}
        </div>
        <div className="list">
          {domain.dimensions.map((dim) => (
            <div className="li" key={dim.key}>
              <span>{dim.name}</span>
              <div className="rate">
                {[0, 1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    className={ratings[dim.key] === v ? "on" : ""}
                    onClick={() => rate(dim.key, v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="section-title">Assessor notes</div>
        <textarea
          value={note}
          placeholder={`Notes on ${domain.name}…`}
          onChange={(ev) => saveNote(ev.target.value)}
        />

        <div className="section-title">Evidence</div>
        <div className="row" style={{ gap: 8 }}>
          <input
            type="text"
            value={evidence}
            placeholder="Attach evidence (a note, a link, a document reference)…"
            onChange={(ev) => setEvidence(ev.target.value)}
          />
          <button className="btn" onClick={attach}>
            Attach
          </button>
        </div>
        {domainEvidence.length > 0 && (
          <div className="list" style={{ marginTop: 10 }}>
            {domainEvidence.map((x, i) => (
              <div className="li" key={i}>
                <span>📎 {x.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="row spread" style={{ marginTop: 16 }}>
        <button
          className="btn"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          ← Previous
        </button>
        {step < DOMAINS.length - 1 ? (
          <button className="btn primary" onClick={() => setStep((s) => s + 1)}>
            Next section →
          </button>
        ) : (
          <button
            className="btn primary"
            disabled={!allRated || e.assessment.completed}
            onClick={finish}
          >
            {e.assessment.completed
              ? "Assessment completed"
              : allRated
                ? "Complete assessment"
                : `Rate all ${prog.total} to complete`}
          </button>
        )}
      </div>
    </div>
  );
}
