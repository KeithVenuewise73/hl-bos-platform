import { describe, expect, it } from "vitest";
import {
  IMAGE_ROUTES,
  chooseModel,
  imageModelFits,
  needsPrimarySourceCheck,
  routesUnder,
} from "./routes";

describe("the route table is honest about what is built", () => {
  it("claims nothing is ready, because nothing is wired", () => {
    expect(IMAGE_ROUTES.every((r) => r.status === "not-built")).toBe(true);
  });

  it("never leaves a route without a plain-English cost", () => {
    for (const route of IMAGE_ROUTES) {
      expect(route.cost.length).toBeGreaterThan(20);
      expect(route.toEnable.length).toBeGreaterThan(20);
    }
  });

  it("marks the entries that were read second-hand", () => {
    // bfl.ai and openai.com were unreachable from the build environment. An
    // entry nobody flagged is an entry somebody will later treat as verified.
    const flagged = needsPrimarySourceCheck().map((r) => r.id);
    expect(flagged).toContain("bfl-flux-kontext");
    expect(flagged).toContain("openai-images");
  });

  it("dates every entry, so a stale policy reads as stale", () => {
    for (const route of IMAGE_ROUTES) {
      expect(route.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("the consent bar decides which routes exist", () => {
  it("leaves only our own hardware under a tick-box", () => {
    const open = routesUnder("self-attestation");
    expect(open.map((r) => r.id)).toEqual(["self-hosted-open-model"]);
  });

  it("opens every third-party route once consent is documented", () => {
    const open = routesUnder("documented-consent");
    expect(open.map((r) => r.id)).toContain("bfl-flux-kontext");
    expect(open.length).toBeGreaterThan(1);
  });

  it("treats our own hardware as an obligation, not an exemption", () => {
    const own = IMAGE_ROUTES.find((r) => r.id === "self-hosted-open-model");
    expect(own?.consentBar).toBe("ours-to-set");
    expect(own?.realPeople).toContain("only safeguard");
  });

  it("records that the best technical fit demands documented consent", () => {
    const kontext = IMAGE_ROUTES.find((r) => r.id === "bfl-flux-kontext");
    expect(kontext?.consentBar).toBe("documented-consent");
    expect(kontext?.realPeople).toContain("intimate");
  });
});

describe("the non-commercial licence trap is recorded as data", () => {
  it("states that serving end users falls outside non-commercial, free or not", () => {
    const own = IMAGE_ROUTES.find((r) => r.id === "self-hosted-open-model");
    // The clause that actually bites: it is not only about charging money.
    expect(own?.licence).toContain("direct interactions with end users");
    expect(own?.licence).toContain("even if that app is free");
  });

  it("says renting a non-commercial model does not make it commercial", () => {
    const rented = IMAGE_ROUTES.find((r) => r.id === "hosted-open-model-marketplace");
    expect(rented?.licence).toContain("does not become commercial by being rented");
  });

  it("carries the caveat on every FLUX tier in the hardware table", () => {
    const flux = imageModelFits(24_000).filter((m) => m.model.startsWith("FLUX"));
    expect(flux).toHaveLength(2);
    for (const tier of flux) expect(tier.note).toContain("NON-COMMERCIAL");
  });
});

describe("imageModelFits", () => {
  it("tells a 12GB card what it can and cannot run", () => {
    const fits = imageModelFits(12_000);
    expect(fits.filter((f) => f.fits).map((f) => f.model)).toEqual([
      "SDXL (compressed)",
      "SDXL + identity adapter",
    ]);
  });

  it("opens the identity-preserving editor only at 24GB", () => {
    expect(imageModelFits(16_000).find((f) => f.model.includes("Kontext"))?.fits).toBe(
      false,
    );
    expect(imageModelFits(24_000).find((f) => f.model.includes("Kontext"))?.fits).toBe(
      true,
    );
  });

  it("says nothing fits when the card is unknown, rather than guessing", () => {
    expect(imageModelFits(null).every((f) => !f.fits)).toBe(true);
  });

  it("is honest that plain SDXL is weak at the thing the product sells", () => {
    const sdxl = imageModelFits(8_000)[0];
    expect(sdxl?.note).toContain("Weak at keeping the same face");
  });
});

describe("chooseModel", () => {
  it("picks the largest model that fits, because quality is the product", () => {
    expect(chooseModel(24_564)?.model).toContain("Kontext");
    expect(chooseModel(16_384)?.model).toBe("FLUX.1 [dev]");
    expect(chooseModel(12_288)?.model).toBe("SDXL + identity adapter");
  });

  it("returns null rather than something that would disappoint", () => {
    // A model that cannot hold a face across two scenes does not make a story.
    expect(chooseModel(6_144)).toBeNull();
    expect(chooseModel(null)).toBeNull();
  });
});
