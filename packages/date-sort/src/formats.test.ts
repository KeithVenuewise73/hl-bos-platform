import { describe, expect, it } from "vitest";

import { classify, sniff } from "./formats";

const b = (...xs: Array<number | string>) =>
  new Uint8Array(
    xs.flatMap((x) =>
      typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x],
    ),
  );

const JPEG = b(0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
const PNG = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0);
const IPHONE_HEIC = b(0, 0, 0, 0x18, "ftypheic", 0, 0, 0, 0);
const CR3 = b(0, 0, 0, 0x18, "ftypcrx ", 0, 0, 0, 1);
const CR2 = b(0x49, 0x49, 0x2a, 0x00, 0x10, 0, 0, 0, "CR", 2, 0, 0, 0, 0, 0);
const PLAIN_TIFF = b(0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
const MP4 = b(0, 0, 0, 0x18, "ftypisom", 0, 0, 0, 0);

describe("identifying a file by its bytes", () => {
  it("recognises JPG/JPEG, PNG, HEIC, CR2 and CR3", () => {
    expect(sniff(JPEG)).toBe("jpeg");
    expect(sniff(PNG)).toBe("png");
    expect(sniff(IPHONE_HEIC)).toBe("heic");
    expect(sniff(CR3)).toBe("cr3");
    expect(sniff(CR2)).toBe("cr2");
  });

  it("does not mistake a plain TIFF or an MP4 for a photo it reads", () => {
    expect(sniff(PLAIN_TIFF)).toBeNull();
    expect(sniff(MP4)).toBeNull();
  });

  it("counts .JPG and .jpeg the same, in any case", () => {
    for (const name of ["IMG_0001.JPG", "IMG_0001.jpeg", "x.JPEG", "x.jpg"]) {
      expect(classify(name, 1000, JPEG)).toEqual({ kind: "photo", format: "jpeg" });
    }
  });

  it("trusts the bytes over the name", () => {
    // A RAW file renamed .jpg is still RAW; a JPEG named .CR3 is still a JPEG.
    expect(classify("IMG_0001.jpg", 1000, CR3)).toEqual({
      kind: "photo",
      format: "cr3",
    });
    expect(classify("IMG_0001.CR3", 1000, JPEG)).toEqual({
      kind: "photo",
      format: "jpeg",
    });
  });

  it("says why a file is not a photo", () => {
    expect(classify("broken.jpg", 20, b("this is text, not"))).toEqual({
      kind: "unsupported",
      reason: "Named .jpg but is not a JPG file",
    });
    expect(classify("fake.CR3", 20, b("not a raw file....."))).toEqual({
      kind: "unsupported",
      reason: "Named .cr3 but is not a CR3 file",
    });
    expect(classify("MVI_0011.MP4", 1000, MP4)).toEqual({
      kind: "unsupported",
      reason: ".mp4 files are not photos DateSort reads",
    });
    expect(classify("Thumbs.db", 1000, JPEG)).toEqual({
      kind: "unsupported",
      reason: "System file, not a photo",
    });
    expect(classify("._IMG_0001.JPG", 4096, JPEG).kind).toBe("unsupported");
    expect(classify("empty.jpg", 0, new Uint8Array(0))).toEqual({
      kind: "unsupported",
      reason: "Empty file",
    });
    expect(classify("README", 10, b("hello")).kind).toBe("unsupported");
  });
});
