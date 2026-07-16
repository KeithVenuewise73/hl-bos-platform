"use client";

import { ActionBar } from "./Actions";
import { buildProject, runTests, checkQuality, pushChanges } from "@/app/actions";

/**
 * The one-click actions that are REAL today.
 *
 * Deliberately absent, rather than present-and-broken:
 *   Deploy Preview / Deploy Production -- no migration has ever been applied and
 *     Supabase branching is not switched on. A button that cannot deploy is a lie.
 *   Rollback -- there is nothing deployed to roll back to.
 *   Sync Supabase -- needs a Supabase token this console does not have.
 * They appear the moment the thing behind them exists.
 */
export function ActionsIsland() {
  return (
    <ActionBar
      actions={[
        {
          label: "Check everything",
          run: checkQuality,
          primary: true,
          hint: "Formatting, code quality, types and tests — the same checks GitHub runs.",
        },
        { label: "Build", run: buildProject, hint: "Compile the software." },
        {
          label: "Run tests",
          run: runTests,
          hint: "Prove the software behaves correctly.",
        },
        {
          label: "Send to GitHub",
          run: pushChanges,
          hint: "Push this machine's work and start the automated checks.",
        },
      ]}
    />
  );
}
