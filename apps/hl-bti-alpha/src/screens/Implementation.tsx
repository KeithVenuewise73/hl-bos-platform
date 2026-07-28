"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import {
  engagementById,
  businessById,
  createProject,
  addMilestone,
  addTask,
  projectCompletion,
  type TaskStatus,
} from "@/lib/store";
import { Card, Badge, EmptyState, Progress } from "@/components/ui";

const NEXT: Record<TaskStatus, TaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
  blocked: "todo",
};

// IMPLEMENTATION DASHBOARD — projects, milestones, tasks and completion. Work
// orders/risks/issues are shown as explicit, honest placeholders (not wired in
// the Alpha) rather than fabricated entries.
export default function Implementation({ engagementId }: { engagementId: string }) {
  const { ws, update } = useWorkspace();
  const [projName, setProjName] = useState("");
  const e = engagementById(ws, engagementId)!;
  const b = businessById(ws, e.businessId)!;

  if (b.analysisOnly) {
    return (
      <EmptyState icon="🔒" title="Implementation disabled">
        {b.name} is analysis-only — no implementation delivery.
      </EmptyState>
    );
  }

  function newProject() {
    if (!projName.trim()) return;
    update((d) => createProject(engagementById(d, engagementId)!, projName.trim()));
    setProjName("");
  }
  function newMilestone(projectId: string) {
    update((d) => {
      const p = engagementById(d, engagementId)!.projects.find(
        (x) => x.id === projectId,
      );
      if (p) addMilestone(p, `Milestone ${p.milestones.length + 1}`);
    });
  }
  function newTask(projectId: string, milestoneId: string, title: string) {
    if (!title.trim()) return;
    update((d) => {
      const p = engagementById(d, engagementId)!.projects.find(
        (x) => x.id === projectId,
      );
      const m = p?.milestones.find((x) => x.id === milestoneId);
      if (m) addTask(m, title.trim());
    });
  }
  function cycleTask(projectId: string, milestoneId: string, taskId: string) {
    update((d) => {
      const t = engagementById(d, engagementId)!
        .projects.find((x) => x.id === projectId)
        ?.milestones.find((x) => x.id === milestoneId)
        ?.tasks.find((x) => x.id === taskId);
      if (t) t.status = NEXT[t.status];
    });
  }

  const overall =
    e.projects.length === 0
      ? 0
      : Math.round(
          e.projects.reduce((n, p) => n + projectCompletion(p), 0) / e.projects.length,
        );

  return (
    <div>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="stat-label">Projects</div>
          <div className="stat-value">{e.projects.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Overall completion</div>
          <div className="stat-value">{overall}%</div>
        </div>
        <div className="stat">
          <div className="stat-label">Open tasks</div>
          <div className="stat-value">
            {
              e.projects
                .flatMap((p) => p.milestones.flatMap((m) => m.tasks))
                .filter((t) => t.status !== "done").length
            }
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Risks / issues</div>
          <div className="stat-value dim" style={{ fontSize: 16 }}>
            Not tracked in Alpha
          </div>
        </div>
      </div>

      <Card title="New project">
        <div className="row" style={{ gap: 8 }}>
          <input
            type="text"
            value={projName}
            placeholder="Project name (e.g. Warehouse Automation)…"
            onChange={(ev) => setProjName(ev.target.value)}
          />
          <button className="btn primary" onClick={newProject}>
            Add project
          </button>
        </div>
      </Card>

      {e.projects.length === 0 ? (
        <EmptyState icon="🧭" title="No projects yet">
          Add a project to begin tracking implementation.
        </EmptyState>
      ) : (
        e.projects.map((p) => (
          <Card
            key={p.id}
            title={p.name}
            action={
              <Badge kind={projectCompletion(p) === 100 ? "ok" : "info"}>
                {projectCompletion(p)}%
              </Badge>
            }
          >
            <Progress pct={projectCompletion(p)} />
            <div style={{ marginTop: 12 }} className="row spread">
              <span className="dim" style={{ fontSize: 12.5 }}>
                {p.milestones.length} milestone(s)
              </span>
              <button className="btn sm" onClick={() => newMilestone(p.id)}>
                + Milestone
              </button>
            </div>
            {p.milestones.map((m) => (
              <div
                key={m.id}
                style={{
                  marginTop: 12,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 10,
                }}
              >
                <div className="row spread">
                  <strong style={{ fontSize: 14 }}>{m.name}</strong>
                  <MilestoneTaskAdder onAdd={(title) => newTask(p.id, m.id, title)} />
                </div>
                <div className="list" style={{ marginTop: 8 }}>
                  {m.tasks.map((t) => (
                    <button
                      className="li"
                      key={t.id}
                      onClick={() => cycleTask(p.id, m.id, t.id)}
                    >
                      <span>
                        {t.status === "done" ? "✓ " : ""}
                        {t.title}
                      </span>
                      <Badge
                        kind={
                          t.status === "done"
                            ? "ok"
                            : t.status === "in_progress"
                              ? "warn"
                              : undefined
                        }
                      >
                        {t.status.replace(/_/g, " ")}
                      </Badge>
                    </button>
                  ))}
                  {m.tasks.length === 0 && (
                    <div className="dim" style={{ fontSize: 12.5 }}>
                      No tasks yet.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>
        ))
      )}
    </div>
  );
}

function MilestoneTaskAdder({ onAdd }: { onAdd: (title: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="row" style={{ gap: 6 }}>
      <input
        type="text"
        value={v}
        placeholder="New task…"
        style={{ width: 180 }}
        onChange={(e) => setV(e.target.value)}
      />
      <button
        className="btn sm"
        onClick={() => {
          onAdd(v);
          setV("");
        }}
      >
        Add
      </button>
    </div>
  );
}
