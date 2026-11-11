import { describe, expect, it } from "vitest";

import { squeezeCSharp, squeezePowerShell } from "./squeeze";

describe("squeezing a PowerShell script", () => {
  it("drops whole-line comments, blank lines and indentation", () => {
    const out = squeezePowerShell(
      ["# a comment", "if ($x) {", "    # inside", "", "    Do-It", "}"].join("\n"),
    );
    expect(out).toBe("if ($x) {\nDo-It\n}");
  });

  it("keeps a # that is part of a line", () => {
    expect(squeezePowerShell("  $a = 'x' # trailing\n  $b = '#notcomment'")).toBe(
      "$a = 'x' # trailing\n$b = '#notcomment'",
    );
  });

  it("passes a here-string through exactly, blank lines, # and indentation included", () => {
    const script = [
      "Add-Type -TypeDefinition @'",
      "  # not a comment, it is data",
      "",
      "    keep   this",
      "'@",
      "  # a real comment",
      "  Run",
    ].join("\n");
    const out = squeezePowerShell(script);
    expect(out).toBe(
      [
        "Add-Type -TypeDefinition @'",
        "  # not a comment, it is data",
        "",
        "    keep   this",
        "'@",
        "Run",
      ].join("\n"),
    );
  });

  it("handles a double-quoted here-string too, and an indented opener", () => {
    const out = squeezePowerShell(['  $t = @"', "  # data", '"@', "  Next"].join("\n"));
    expect(out).toBe(['$t = @"', "  # data", '"@', "Next"].join("\n"));
  });

  it("makes the real iPhone script shorter and still contains what matters", async () => {
    const { IPHONE_SCRIPT } = await import("./iphone-script");
    expect(IPHONE_SCRIPT).toContain("ExtendedProperty('System.Size')");
    expect(IPHONE_SCRIPT).toContain("Add-Type -TypeDefinition @'");
    expect(IPHONE_SCRIPT.split("\n").filter((l) => l.trim().startsWith("#"))).toEqual(
      [],
    );
  });
});

describe("squeezing C#", () => {
  it("drops // and /// comment lines, blank lines and indentation", () => {
    expect(
      squeezeCSharp("  /// doc\n  int a = 1; // keep this\n\n  // gone\n  int b;"),
    ).toBe("int a = 1; // keep this\nint b;");
  });
});
