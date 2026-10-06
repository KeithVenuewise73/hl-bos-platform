import { describe, expect, it } from "vitest";

import {
  encodeForPowerShell,
  parsePickerOutput,
  pickerScript,
  PICKER_TITLE,
} from "./picker-script";

describe("the Windows folder window", () => {
  const script = pickerScript();

  it("is the modern folder picker, folders only, real paths only", () => {
    expect(script).toContain("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7"); // FileOpenDialog
    expect(script).toContain("FOS_PICKFOLDERS");
    expect(script).toContain("FOS_FORCEFILESYSTEM");
    expect(script).toContain(PICKER_TITLE);
  });

  it("only chooses a folder: it reads, writes and deletes nothing", () => {
    for (const verb of [
      "Remove-Item",
      "Set-Content",
      "Out-File",
      "New-Item",
      "Move-Item",
      "Copy-Item",
      "Rename-Item",
      "Get-ChildItem",
    ]) {
      expect(script).not.toContain(verb);
    }
  });

  it("encodes as UTF-16LE Base64, as powershell -EncodedCommand expects", () => {
    expect(Buffer.from(encodeForPowerShell("hi é"), "base64").toString("utf16le")).toBe(
      "hi é",
    );
  });

  it("reads the answer, including paths with spaces and accents", () => {
    expect(
      parsePickerOutput('{"path":"D:\\\\5-Star Sports Media\\\\Équipe"}\r\n'),
    ).toEqual({
      kind: "picked",
      path: "D:\\5-Star Sports Media\\Équipe",
    });
    expect(parsePickerOutput('{"cancelled":true}')).toEqual({ kind: "cancelled" });
    expect(parsePickerOutput("").kind).toBe("failed");
    expect(parsePickerOutput("{nonsense").kind).toBe("failed");
    expect(parsePickerOutput('{"path":""}').kind).toBe("failed");
  });
});
