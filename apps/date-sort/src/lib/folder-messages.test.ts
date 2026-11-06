import { describe, expect, it } from "vitest";

import { folderPlanForDay } from "@hl-bos/date-sort/copy";

import {
  COPY_BUTTON,
  actionButton,
  noDestinationMessage,
  notCopiedMessage,
  renameMessage,
} from "./folder-messages.ts";

describe("what to press when a date's folder is not ready", () => {
  it("names the real label of the card's copy button, not a vaguer word", () => {
    expect(COPY_BUTTON).toBe('"Create folder & copy photos"');
    for (const m of [
      noDestinationMessage("publish"),
      renameMessage("publish", "2026-11-03", "2026-11-03 - Volleyball_Boys"),
      notCopiedMessage("jersey"),
    ]) {
      expect(m).toContain('"Create folder & copy photos"');
      expect(m).not.toMatch(/press copy first/i);
    }
  });

  it("says which button to come back to, by its label", () => {
    expect(actionButton("publish")).toBe('"Publish to 5 Star"');
    expect(actionButton("jersey")).toBe('"Find jersey numbers"');
    expect(notCopiedMessage("publish")).toContain('press "Publish to 5 Star" again');
    expect(notCopiedMessage("jersey")).toContain('press "Find jersey numbers" again');
  });

  it("for a renamed folder, shows both names and says it only renames", () => {
    const m = renameMessage("publish", "2026-11-03", "2026-11-03 - Volleyball_Boys");
    expect(m).toContain('folder on your drive is "2026-11-03"');
    expect(m).toContain('"2026-11-03 - Volleyball_Boys"');
    expect(m).toContain("to rename the folder to match");
    expect(m).toContain("nothing is copied twice");
    expect(m).toContain('"Copy again…"');
  });

  it("matches what the folder plan really does for the case in the screenshot", () => {
    // One folder for the date under another name, and a new name typed:
    // the plan is a rename, which is exactly what the message promises.
    const plan = folderPlanForDay("2026-11-03", "Volleyball_Boys", ["2026-11-03"]);
    expect(plan).toEqual({
      kind: "rename",
      from: "2026-11-03",
      name: "2026-11-03 - Volleyball_Boys",
    });
  });
});
