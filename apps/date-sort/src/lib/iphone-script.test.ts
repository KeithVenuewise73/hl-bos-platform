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
    // Windows hides known extensions by default, and the Shell's .Name follows
    // that ("IMG_0042" for IMG_0042.MOV): the real name must come from
    // System.FileName, or the script waits for a file that never appears.
    expect(IPHONE_SCRIPT).toContain("ExtendedProperty('System.FileName')");
    // A copy that stops part-way must never be kept as whole: when the phone
    // gave a size, only that exact size counts as complete. (On Keith's
    // iPhone, a video copy failed at about 60%.)
    expect(IPHONE_SCRIPT).toContain(
      "if ($sure -and $len -eq $x.size -and $steady -ge 2)",
    );
    expect(IPHONE_SCRIPT).toContain(
      "if (-not $sure -and $len -gt 0 -and $steady -ge 10)",
    );
    // On Keith's iPhone, one big video failed every time and the phone then
    // stopped answering: earlier failures go last, and three in a row end
    // the run with a plain message instead of an error box per file.
    expect(IPHONE_SCRIPT).toContain("failed-before.txt");
    expect(IPHONE_SCRIPT).toContain("if ($inARow -ge 3) { $stuck = $true; break }");
  });

  it("brings in only photos or only videos, and only what is recent, when asked", () => {
    // Which kind and how far back come from the environment, like the paths.
    expect(IPHONE_SCRIPT).toContain("$env:DS_KIND");
    expect(IPHONE_SCRIPT).toContain("$env:DS_DAYS");
    // Videos are MOV, MP4, M4V; photos are the picture formats. Nothing else
    // (sidecar files, say) comes across in either.
    expect(IPHONE_SCRIPT).toContain("\\.(mov|mp4|m4v)$");
    expect(IPHONE_SCRIPT).toContain("heic|heif|jpg|jpeg|png|dng|gif|tif|tiff");
    expect(IPHONE_SCRIPT).toContain(
      "if ($kind -eq 'videos' -and $name -notmatch $videoExt) { continue }",
    );
    expect(IPHONE_SCRIPT).toContain(
      "if ($kind -eq 'photos' -and $name -notmatch $photoExt) { continue }",
    );
    // A file whose date the phone does not give is kept, never silently
    // dropped: only a real date older than the cutoff leaves it out.
    expect(IPHONE_SCRIPT).toContain("$when.Year -gt 1980 -and $when -lt $cutoff");
    // The number of files left out for age is reported, not hidden.
    expect(IPHONE_SCRIPT).toContain("older = $older");
  });

  it("brings the smallest files in first, can split small from large, and can only look", () => {
    // Smallest first, so the quick ones are across before the giant ones start;
    // earlier failures still go last, after this sort.
    const sort = IPHONE_SCRIPT.indexOf("Sort-Object -Property size");
    const failedLast = IPHONE_SCRIPT.indexOf("$pending.ContainsKey($_.folder");
    expect(sort).toBeGreaterThan(0);
    expect(failedLast).toBeGreaterThan(sort);
    // Small is up to the split, large is over it; the other half is counted, not hidden.
    expect(IPHONE_SCRIPT).toContain(
      "if ($size -eq 'small' -and $sz -gt $split) { $held += 1; continue }",
    );
    expect(IPHONE_SCRIPT).toContain(
      "if ($size -eq 'large' -and $sz -le $split) { $held += 1; continue }",
    );
    // "Check size first" reports and stops before anything is created or copied.
    const preview = IPHONE_SCRIPT.indexOf("$env:DS_PREVIEW -eq '1'");
    expect(preview).toBeGreaterThan(IPHONE_SCRIPT.indexOf("type = 'found'"));
    expect(preview).toBeLessThan(
      IPHONE_SCRIPT.indexOf("New-Item -ItemType Directory -Force -Path $incoming"),
    );
    expect(preview).toBeLessThan(IPHONE_SCRIPT.indexOf("CopyHere("));
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
