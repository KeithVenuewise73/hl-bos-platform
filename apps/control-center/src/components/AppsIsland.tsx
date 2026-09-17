"use client";

import { ActionBar } from "./Actions";
import { openLocalApp } from "@/app/actions";

/**
 * Start a local app without a terminal.
 *
 * Each button builds the app if it needs building, starts it, and waits until
 * it actually answers before reporting success — then offers the link. If it
 * never answers, it says so and offers nothing, because a link to a page that
 * will not load is worse than no link.
 */
export function AppsIsland({
  apps,
}: {
  apps: readonly { key: string; name: string; running: boolean }[];
}) {
  return (
    <ActionBar
      actions={apps.map((app) => ({
        label: app.running ? `Restart ${app.name}` : `Start ${app.name}`,
        run: () => openLocalApp(app.key),
        primary: !app.running,
        hint: app.running
          ? "It is already running. This rebuilds and reports the link again."
          : "Builds it if needed, starts it, and waits until it is really up.",
      }))}
    />
  );
}
