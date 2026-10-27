import { describe, expect, it } from "vitest";

import { IPHONE_SCRIPT, parseIphoneLine } from "./iphone-script";

describe("the iPhone copy script", () => {
  it("never changes anything on the phone", () => {
    // No delete, no move off the phone, no Shell verbs that could do either.
    for (const word of [
      "Remove-Item",
      "Delete(",
      ".Delete",
      "MoveHere",
      "InvokeVerb",
      "Move-Item",
      "Rename-Item",
      "Format-",
      "Clear-",
    ]) {
      expect(IPHONE_SCRIPT, word).not.toContain(word);
    }
    // Its one move is inside the chosen folder: from .datesort-incoming to
    // the file's real name, once complete.
    expect(IPHONE_SCRIPT.match(/\[System\.IO\.File\]::Move\(/g)).toHaveLength(1);
    expect(IPHONE_SCRIPT).toContain("[System.IO.File]::Move($part, $target)");
    // The phone is only ever read through CopyHere into our own folder.
    expect(IPHONE_SCRIPT.match(/CopyHere\(/g)).toHaveLength(1);
  });

  it("takes paths only from the environment, never pasted into the script", () => {
    expect(IPHONE_SCRIPT).toContain("$env:DS_DEST");
    expect(IPHONE_SCRIPT).not.toMatch(/[A-Z]:\\/);
  });

  it("reads its own output lines and ignores anything else", () => {
    expect(parseIphoneLine('{"type":"none"}')).toEqual({ type: "none" });
    expect(
      parseIphoneLine(
        '{"type":"file","folder":"100APPLE","name":"IMG_0042.MOV","result":"copied","bytes":12}\r',
      ),
    ).toMatchObject({ result: "copied" });
    expect(parseIphoneLine("WARNING: something")).toBeNull();
    expect(parseIphoneLine('{"type":"surprise"}')).toBeNull();
  });
});
