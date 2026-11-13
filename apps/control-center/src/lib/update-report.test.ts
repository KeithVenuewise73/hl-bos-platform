import { describe, expect, it } from "vitest";
import { describeUpdate } from "./update-report";

const line = (o: object) => JSON.stringify(o);

describe("Update from GitHub, in plain English", () => {
  it("says when the new code is here but the console must be reopened", () => {
    const r = describeUpdate(
      line({
        kind: "updated",
        rebuild: true,
        message: "Collected 2 new changes from GitHub.",
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.meaning).toMatch(/still running the old version/);
    expect(r.meaning).toMatch(/control-center\.bat/);
  });

  it("says when there is nothing to collect", () => {
    const r = describeUpdate(
      line({ kind: "current", rebuild: false, message: "Already up to date." }),
    );
    expect(r.ok).toBe(true);
    expect(r.headline).toBe("Already up to date.");
  });

  it("reports a refusal as a refusal, with the reason", () => {
    const r = describeUpdate(
      line({
        kind: "blocked",
        rebuild: false,
        message:
          "You have unsaved changes in this folder, so nothing was touched. Starting as-is.",
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.headline).toBe("Nothing was updated.");
    expect(r.meaning).toMatch(/unsaved changes/);
  });

  it("never invents a result when the updater gave no answer", () => {
    for (const out of [
      "",
      "garbage",
      "{not json",
      line({ kind: "weird", message: "x" }),
    ]) {
      const r = describeUpdate(out);
      expect(r.ok).toBe(false);
      expect(r.headline).toBe("Could not check for updates.");
    }
  });

  it("finds the answer among other output lines", () => {
    const r = describeUpdate(
      `noise\n${line({ kind: "current", rebuild: false, message: "Already up to date." })}\n`,
    );
    expect(r.ok).toBe(true);
  });
});
