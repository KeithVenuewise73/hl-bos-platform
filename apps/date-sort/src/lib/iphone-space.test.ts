import { describe, expect, it } from "vitest";

import {
  checkSpace,
  defaultVideoFolder,
  driveNearlyFullMessage,
  driveOf,
  folderWarning,
  noRoomMessage,
  roomSentence,
  SPACE_MARGIN_BYTES,
  unknownSizeSentence,
} from "./iphone-space";

const GB = 1024 ** 3;

describe("will it fit", () => {
  it("is enough when the files and the margin fit", () => {
    expect(checkSpace(10 * GB, 100 * GB)).toEqual({ enough: true, known: true });
  });

  it("is not enough when the files fit but the margin does not", () => {
    const free = 10 * GB + SPACE_MARGIN_BYTES - 1;
    expect(checkSpace(10 * GB, free).enough).toBe(false);
    expect(checkSpace(10 * GB, free + 1).enough).toBe(true);
  });

  it("is not enough when the files alone do not fit (the real failure: 30 GB free)", () => {
    expect(checkSpace(120 * GB, 30.8 * GB)).toEqual({ enough: false, known: true });
  });

  it("does not block when the free space cannot be read, and says it did not know", () => {
    expect(checkSpace(120 * GB, null)).toEqual({ enough: true, known: false });
    expect(roomSentence("D:\\Iphone Videos", 120 * GB, null, true)).toMatch(
      /could not read how much room D: has/,
    );
  });
});

describe("the words", () => {
  it("names the drive, the need, what is free and how much more is needed", () => {
    const s = roomSentence("C:\\Users\\x\\Videos", 120 * GB, 30 * GB, false);
    expect(s).toMatch(/will not fit/);
    expect(s).toMatch(/120\.0 GB/);
    expect(s).toMatch(/C: has only 30\.0 GB free/);
    expect(s).toMatch(/92\.0 GB more room/);
  });

  it("the refusal says nothing was copied and the phone was not touched", () => {
    const m = noRoomMessage("D:\\V", 120 * GB, 30 * GB);
    expect(m).toMatch(/^Nothing was copied\./);
    expect(m).toMatch(/Nothing on the iPhone was touched/);
  });

  it("reads the drive letter, in capitals", () => {
    expect(driveOf("d:\\x")).toBe("D:");
    expect(driveOf("\\\\nas\\share")).toBe("that folder's drive");
  });
});

describe("folders that are a poor home for large files", () => {
  it("warns about OneDrive, the folder that went wrong", () => {
    const w = folderWarning("C:\\Users\\kherm\\OneDrive\\Documents", "videos");
    expect(w).toMatch(/inside OneDrive/);
    expect(w).toMatch(/upload every one of these videos/);
  });

  it("warns about a company OneDrive name too", () => {
    expect(folderWarning("D:\\OneDrive - Herman Legacy\\V", "videos")).toMatch(
      /OneDrive/,
    );
  });

  it("warns about C: but not about D:", () => {
    expect(folderWarning("C:\\Videos", "videos")).toMatch(/laptop's own drive/);
    expect(folderWarning("D:\\Iphone Videos", "videos")).toBeNull();
  });

  it("does not mistake a folder merely named like OneDrive", () => {
    expect(folderWarning("D:\\OneDriveBackups\\V", "videos")).toBeNull();
  });
});

describe("where the videos go when none was chosen", () => {
  it("is beside the photos folder", () => {
    expect(defaultVideoFolder("D:\\Iphone Photos")).toBe("D:\\Iphone Videos");
    expect(defaultVideoFolder("D:\\Hockey\\Iphone Photos\\")).toBe(
      "D:\\Hockey\\Iphone Videos",
    );
  });

  it("is never on C: or in OneDrive: it asks instead", () => {
    expect(defaultVideoFolder("C:\\Users\\kherm\\Pictures")).toBeNull();
    expect(defaultVideoFolder("C:\\Users\\kherm\\OneDrive\\Photos")).toBeNull();
  });

  it("is nothing when there is no photos folder to go beside", () => {
    expect(defaultVideoFolder(null)).toBeNull();
    expect(defaultVideoFolder("")).toBeNull();
    expect(defaultVideoFolder("D:")).toBeNull();
  });
});

describe("when sizes are unknown or the drive fills part-way", () => {
  it("says the size is unknown and what protects the drive instead", () => {
    const t = unknownSizeSentence("C:\\V", 30 * GB);
    expect(t).toMatch(/did not report how big/);
    expect(t).toMatch(/C: has 30\.0 GB free/);
    expect(t).toMatch(/stop by itself if C: gets nearly full/);
  });

  it("explains a copy stopped part-way, and that nothing was lost or touched", () => {
    const t = driveNearlyFullMessage("C:\\V", 24 * GB, 6 * GB);
    expect(t).toMatch(/^Stopped to keep C: from filling up/);
    expect(t).toMatch(/24\.0 GB has been copied/);
    expect(t).toMatch(/only 6\.0 GB left/);
    expect(t).toMatch(/already copied is kept/);
  });
});
