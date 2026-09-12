"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { recordAssignmentProgress, type ActionResult } from "@/app/actions";
import { Badge } from "./ui";

/**
 * One assignment, from the athlete's side.
 *
 * Marking it reviewed is the athlete's own action and nobody else's. The
 * database enforces that; this component just gives them the button.
 */
export function AthleteAssignment({
  assignment,
  items,
}: {
  assignment: {
    id: string;
    kind: string;
    message: string | null;
    status: string;
    dueOn: string | null;
  };
  items: readonly { id: string; label: string; href: string | null }[];
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const done = assignment.status === "completed";

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{assignment.kind}</h2>
          {assignment.message !== null ? (
            <p className="card-sub">{assignment.message}</p>
          ) : null}
        </div>
        <Badge tone={done ? "good" : "warn"}>{assignment.status}</Badge>
      </div>

      {items.length === 0 ? (
        <p className="dim small">Your coach has not attached a clip to this yet.</p>
      ) : (
        <div className="row">
          {items.map((item) =>
            item.href === null ? (
              <span key={item.id} className="badge">
                {item.label}
              </span>
            ) : (
              <Link key={item.id} href={item.href} className="btn sm">
                {item.label}
              </Link>
            ),
          )}
        </div>
      )}

      {!done ? (
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="btn sm"
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () =>
                setResult(await recordAssignmentProgress(assignment.id, "viewed")),
              )
            }
          >
            I watched it
          </button>
          <button
            className="btn sm primary"
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () =>
                setResult(await recordAssignmentProgress(assignment.id, "completed")),
              )
            }
          >
            Mark reviewed
          </button>
        </div>
      ) : null}

      {result !== null ? (
        <div
          className={result.ok ? "notice accent" : "notice bad"}
          style={{ marginTop: 12 }}
        >
          {result.message}
        </div>
      ) : null}
    </section>
  );
}
