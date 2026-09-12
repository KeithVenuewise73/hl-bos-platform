"use client";

import { useState, useTransition } from "react";
import { removeDemoProgram, seedDemoProgram, type ActionResult } from "@/app/actions";
import { Card, Notice } from "./ui";

/**
 * Add or remove the demo program.
 *
 * Deliberately explicit, never automatic, and never on by default. Demo data
 * that appears without being asked for is indistinguishable from real data that
 * arrived from somewhere — which is exactly the confusion Principle 10 exists
 * to prevent. The copy says what it creates and what it does not.
 */
export function DemoControls({
  tenantId,
  hasDemo,
}: {
  tenantId: string;
  hasDemo: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <Card
      title="Demo program"
      sub="A worked example: West Seneca Wolves vs Orchard Park, Week 3."
    >
      <p className="dim small">
        Creates a real team with a real 25-play chart, tagged formations, concepts,
        coverages and results, five players, and 50 unresolved AI suggestions attributed
        to a model called <span className="mono">demo-seed</span> — which is not a model
        that exists.
      </p>
      <Notice>
        <strong>The film has no video.</strong> Nothing was watched to produce this, so
        the film record sits in a &ldquo;demo — no video&rdquo; state rather than
        &ldquo;ready&rdquo;, and no screen will offer you a play button that leads
        nowhere. The team is marked DEMO everywhere it appears.
      </Notice>

      <div className="row" style={{ marginTop: 12 }}>
        {hasDemo ? (
          <button
            className="btn danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setResult(await removeDemoProgram(tenantId));
              })
            }
          >
            {pending ? "Removing…" : "Remove demo program"}
          </button>
        ) : (
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setResult(await seedDemoProgram(tenantId));
              })
            }
          >
            {pending ? "Adding…" : "Add demo program"}
          </button>
        )}
      </div>

      {result !== null ? (
        <div
          className={result.ok ? "notice accent" : "notice bad"}
          style={{ marginTop: 12 }}
        >
          {result.message}
        </div>
      ) : null}
    </Card>
  );
}
