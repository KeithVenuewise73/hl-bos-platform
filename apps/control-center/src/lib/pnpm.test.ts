import { describe, expect, it } from "vitest";

import { BUNDLED_PNPM, pnpmInvocation } from "./pnpm";

describe("pnpmInvocation", () => {
  const bundledPath =
    "C:\\Users\\keith\\HL-BOS\\.hlbos\\toolchain\\node_modules\\pnpm\\bin\\pnpm.cjs";

  it("runs the copy inside the repository through node when it is there", () => {
    // This is the case on the operator's machine. The launcher installs pnpm
    // into the repo precisely so it does not need the PATH or admin rights.
    expect(
      pnpmInvocation(["--filter", "x", "build"], { path: bundledPath, exists: true }),
    ).toEqual({
      bin: "node",
      args: [bundledPath, "--filter", "x", "build"],
      bundled: true,
    });
  });

  it("never spawns the bare name when the bundled copy exists", () => {
    // The bare name fails twice on Windows: pnpm is not on the PATH at all,
    // and where it is, it is a .cmd that node will not spawn without a shell.
    const { bin } = pnpmInvocation(["install"], { path: bundledPath, exists: true });
    expect(bin).toBe("node");
    expect(bin).not.toBe("pnpm");
  });

  it("falls back to the PATH on a machine that has no bundled copy", () => {
    expect(pnpmInvocation(["build"], { path: bundledPath, exists: false })).toEqual({
      bin: "pnpm",
      args: ["build"],
      bundled: false,
    });
  });

  it("passes the arguments through untouched, in order", () => {
    const args = ["--filter", "@hl-bos/sceneflow-app", "start:network"];
    expect(pnpmInvocation(args, { path: bundledPath, exists: true }).args).toEqual([
      bundledPath,
      ...args,
    ]);
    expect(pnpmInvocation(args, { path: bundledPath, exists: false }).args).toEqual(
      args,
    );
  });

  it("handles no arguments", () => {
    expect(pnpmInvocation([], { path: bundledPath, exists: true }).args).toEqual([
      bundledPath,
    ]);
  });

  it("points at the path the launcher actually writes", () => {
    // If the launcher ever moves it, this is the test that should fail.
    expect(BUNDLED_PNPM.join("/")).toBe(
      ".hlbos/toolchain/node_modules/pnpm/bin/pnpm.cjs",
    );
  });
});
