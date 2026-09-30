import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_BYTES,
  checkUpload,
  isId,
  safeOriginalName,
  sniffMedia,
} from "./media.ts";

const bytes = (...parts: (number[] | string)[]): Uint8Array => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") for (const c of p) out.push(c.charCodeAt(0));
    else out.push(...p);
  }
  while (out.length < 16) out.push(0);
  return Uint8Array.from(out);
};

describe("sniffMedia", () => {
  it("recognises photos by their bytes", () => {
    expect(sniffMedia(bytes([0xff, 0xd8, 0xff, 0xe0]))?.mimeType).toBe("image/jpeg");
    expect(sniffMedia(bytes("\x89PNG\r\n\x1a\n"))?.mimeType).toBe("image/png");
    expect(sniffMedia(bytes("GIF89a"))?.mimeType).toBe("image/gif");
    expect(sniffMedia(bytes("RIFF", [0, 0, 0, 0], "WEBP"))?.mimeType).toBe(
      "image/webp",
    );
  });

  it("recognises video by its bytes", () => {
    expect(sniffMedia(bytes([0, 0, 0, 0x20], "ftypisom"))?.mimeType).toBe("video/mp4");
    expect(sniffMedia(bytes([0, 0, 0, 0x14], "ftypqt  "))?.mimeType).toBe(
      "video/quicktime",
    );
    expect(sniffMedia(bytes([0x1a, 0x45, 0xdf, 0xa3]))?.mimeType).toBe("video/webm");
  });

  it("refuses HEIC rather than storing something nobody can view", () => {
    expect(sniffMedia(bytes([0, 0, 0, 0x18], "ftypheic"))).toBeNull();
  });

  it("refuses anything else, whatever it is named", () => {
    expect(sniffMedia(bytes("<html><script>"))).toBeNull();
    expect(sniffMedia(bytes("%PDF-1.7"))).toBeNull();
  });
});

describe("checkUpload", () => {
  it("enforces the per-kind size limit", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    const v = checkUpload(big, 0);
    expect(v.ok).toBe(false);
  });

  it("enforces the per-project count", () => {
    expect(checkUpload(bytes([0xff, 0xd8, 0xff]), 10).ok).toBe(false);
    expect(checkUpload(bytes([0xff, 0xd8, 0xff]), 9).ok).toBe(true);
  });
});

describe("ids and names", () => {
  it("accepts only plain lowercase UUIDs as ids", () => {
    expect(isId("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(isId("../../etc/passwd")).toBe(false);
    expect(isId("0f8fad5b-d9cb-469f-a165-70867728950e/..")).toBe(false);
  });

  it("strips paths and odd characters from display names", () => {
    expect(safeOriginalName("C:\\Users\\me\\game <1>.jpg")).toBe("game 1.jpg");
    expect(safeOriginalName("../../")).toBe("upload");
  });
});
