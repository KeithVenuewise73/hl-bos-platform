import { describe, expect, it } from "vitest";

import {
  describe as describeGpu,
  looksLikeNvidia,
  parseAdapters,
  parseNvidiaSmi,
  probeGpu,
  type GpuProbe,
} from "./gpu-report";

describe("parseNvidiaSmi", () => {
  it("reads the card name and its video memory", () => {
    expect(parseNvidiaSmi("NVIDIA GeForce RTX 4090, 24564\n")).toEqual({
      name: "NVIDIA GeForce RTX 4090",
      vramMB: 24564,
    });
  });

  it("takes the first card when there are several", () => {
    expect(
      parseNvidiaSmi("NVIDIA RTX A4000, 16376\nNVIDIA GeForce GTX 1080, 8192\n")?.name,
    ).toBe("NVIDIA RTX A4000");
  });

  it("returns nothing rather than guessing at unreadable output", () => {
    expect(parseNvidiaSmi("")).toBeNull();
    expect(parseNvidiaSmi("\n\n")).toBeNull();
    expect(parseNvidiaSmi("command not found")).toBeNull();
    expect(parseNvidiaSmi("NVIDIA Something, [N/A]")).toBeNull();
    expect(parseNvidiaSmi("NVIDIA Something, 0")).toBeNull();
  });
});

describe("parseAdapters", () => {
  it("reads one adapter per line, trimming and de-duplicating", () => {
    expect(
      parseAdapters("Intel(R) UHD Graphics 630\r\n\r\nIntel(R) UHD Graphics 630\r\n"),
    ).toEqual(["Intel(R) UHD Graphics 630"]);
  });

  it("is empty for empty output", () => {
    expect(parseAdapters("")).toEqual([]);
  });
});

describe("looksLikeNvidia", () => {
  it("recognises the names NVIDIA cards actually report", () => {
    for (const name of [
      "NVIDIA GeForce RTX 4090",
      "GeForce GTX 1660 Ti",
      "Quadro P2000",
      "Tesla T4",
    ]) {
      expect(looksLikeNvidia([name]), name).toBe(true);
    }
  });

  it("does not mistake integrated graphics for a real card", () => {
    for (const name of [
      "Intel(R) UHD Graphics 630",
      "AMD Radeon(TM) Graphics",
      "Microsoft Basic Display Adapter",
    ]) {
      expect(looksLikeNvidia([name]), name).toBe(false);
    }
  });
});

describe("describe — the sentence the CEO actually reads", () => {
  it("says yes, and names the best model the card can handle", () => {
    const result = describeGpu(
      { name: "NVIDIA GeForce RTX 4090", vramMB: 24564 },
      [],
      true,
    );
    expect(result.verdict).toBe("yes");
    expect(result.headline).toContain("RTX 4090");
    expect(result.headline).toContain("24GB");
    expect(result.detail).toContain("LTX-2");
  });

  it("names a smaller model for a smaller card", () => {
    const result = describeGpu(
      { name: "NVIDIA GeForce RTX 3060", vramMB: 12288 },
      [],
      true,
    );
    expect(result.verdict).toBe("yes");
    expect(result.detail).toContain("5B");
    expect(result.detail).not.toContain("LTX-2");
  });

  it("says no when the card is real but too small, without pretending otherwise", () => {
    const result = describeGpu(
      { name: "NVIDIA GeForce GTX 1050", vramMB: 2048 },
      [],
      true,
    );
    expect(result.verdict).toBe("no");
    expect(result.headline).toContain("GTX 1050");
    expect(result.detail).toContain("not realistic");
  });

  it("distinguishes a missing driver from a missing card", () => {
    // These have completely different answers. Merging them would be a lie.
    const driverMissing = describeGpu(null, ["NVIDIA GeForce RTX 3070"], false);
    expect(driverMissing.verdict).toBe("unknown");
    expect(driverMissing.detail).toContain("driver");

    const noCard = describeGpu(null, ["Intel(R) Iris(R) Xe Graphics"], true);
    expect(noCard.verdict).toBe("no");
    expect(noCard.detail).toContain("Iris");
    expect(noCard.detail).not.toContain("driver");
  });

  it("admits it does not know when nothing could be read", () => {
    const result = describeGpu(null, [], false);
    expect(result.verdict).toBe("unknown");
    expect(result.headline).toContain("Could not tell");
    expect(result.detail).toContain("rather than guessed");
  });

  it("never returns an empty sentence for any combination", () => {
    const cards = [null, { name: "NVIDIA RTX A2000", vramMB: 6144 }];
    const adapterSets = [[], ["Intel(R) UHD Graphics"], ["NVIDIA GeForce RTX 3070"]];
    for (const card of cards) {
      for (const adapters of adapterSets) {
        for (const smiRan of [true, false]) {
          const result = describeGpu(card, adapters, smiRan);
          expect(result.headline.length).toBeGreaterThan(10);
          expect(result.detail.length).toBeGreaterThan(30);
          expect(["yes", "no", "unknown"]).toContain(result.verdict);
        }
      }
    }
  });
});

describe("probeGpu — including the Windows path, which cannot run here", () => {
  /** A machine that answers exactly what we tell it to. */
  const machine = (
    platform: string,
    answers: Record<string, { ok: boolean; stdout: string }>,
  ): GpuProbe => ({
    platform,
    run: (bin) => Promise.resolve(answers[bin] ?? { ok: false, stdout: "" }),
  });

  it("reports a working card from nvidia-smi alone", async () => {
    const finding = await probeGpu(
      machine("win32", {
        "nvidia-smi": { ok: true, stdout: "NVIDIA GeForce RTX 4080, 16376\n" },
      }),
    );
    expect(finding.verdict).toBe("yes");
    expect(finding.nvidia).toEqual({ name: "NVIDIA GeForce RTX 4080", vramMB: 16376 });
    expect(finding.canRun.filter((f) => f.fits).map((f) => f.model)).toEqual([
      "Wan 2.2 (1.3B, compressed)",
      "Wan 2.2 (5B, compressed)",
      "Wan 2.2 (14B, compressed)",
    ]);
  });

  it("falls back to the Windows adapter list and calls integrated graphics what it is", async () => {
    const finding = await probeGpu(
      machine("win32", {
        powershell: { ok: true, stdout: "Intel(R) UHD Graphics 770\r\n" },
      }),
    );
    expect(finding.verdict).toBe("no");
    expect(finding.adapters).toEqual(["Intel(R) UHD Graphics 770"]);
    expect(finding.headline).toContain("No NVIDIA card");
    expect(finding.evidence.join(" ")).toContain("Windows display adapter list: read");
  });

  it("spots a card whose driver is missing, rather than declaring there is none", async () => {
    const finding = await probeGpu(
      machine("win32", {
        powershell: {
          ok: true,
          stdout: "NVIDIA GeForce RTX 3070\r\nIntel(R) UHD Graphics\r\n",
        },
      }),
    );
    expect(finding.verdict).toBe("unknown");
    expect(finding.detail).toContain("driver");
  });

  it("does not attempt the Windows command on a machine that is not Windows", async () => {
    const asked: string[] = [];
    const finding = await probeGpu({
      platform: "linux",
      run: (bin) => {
        asked.push(bin);
        return Promise.resolve({ ok: false, stdout: "" });
      },
    });
    expect(asked).toEqual(["nvidia-smi"]);
    expect(finding.evidence.join(" ")).toContain("not Windows");
  });

  it("says unknown, not no, when the adapter list cannot be read", async () => {
    const finding = await probeGpu(machine("win32", {}));
    expect(finding.verdict).toBe("unknown");
    expect(finding.evidence.join(" ")).toContain("could not be read");
  });
});
