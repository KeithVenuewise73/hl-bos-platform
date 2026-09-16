import { describe, expect, it } from "vitest";
import { isUsableResume, parseResume } from "./resume-parser.ts";
import { DEMO_RESUME_TEXT } from "./demo.ts";

describe("parseResume", () => {
  const parsed = parseResume(DEMO_RESUME_TEXT);

  it("reads the header without mistaking contact details for a name", () => {
    expect(parsed.fullName).toBe("Marcus Delgado");
    expect(parsed.headline).toBe("Transportation and Distribution Operations Leader");
    expect(parsed.contact.email).toBe("marcus.delgado@example.com");
    expect(parsed.contact.phone).toBe("(602) 555-0148");
    expect(parsed.contact.location).toBe("Phoenix, AZ");
  });

  it("reads every role with its employer, dates and bullets", () => {
    expect(parsed.experience).toHaveLength(3);
    const [first, , third] = parsed.experience;
    expect(first?.title).toBe("Senior Operations Manager");
    expect(first?.employer).toBe("Meridian Logistics Group");
    expect(first?.current).toBe(true);
    expect(first?.bullets).toHaveLength(6);
    expect(third?.endDate).toBe("May 2015");
    expect(third?.current).toBe(false);
  });

  it("keeps the skills, education and certifications sections", () => {
    expect(parsed.skills).toContain("Final-Mile Delivery");
    expect(parsed.education[0]?.credential).toBe("B.S. Business Administration");
    expect(parsed.education[0]?.year).toBe("2011");
    expect(parsed.certifications).toContain("OSHA 30");
  });

  it("loses nothing: every bullet in the source survives the parse", () => {
    const sourceBullets = DEMO_RESUME_TEXT.split("\n").filter((l) =>
      l.startsWith("•"),
    ).length;
    const parsedBullets = parsed.experience.reduce((n, e) => n + e.bullets.length, 0);
    expect(parsedBullets).toBe(sourceBullets);
  });

  it("accepts a resume with no headings by keeping the text", () => {
    const messy = parseResume(
      "Jane Roe\njane@example.com\n\nDispatcher, Acme Freight, 2019 - 2023\n• Dispatched 40 loads a day.",
    );
    expect(messy.fullName).toBe("Jane Roe");
    expect(isUsableResume(messy)).toBe(false);
  });

  it("reports a resume as usable only when there is something to analyse", () => {
    expect(isUsableResume(parsed)).toBe(true);
    expect(isUsableResume(parseResume("Just a name\n"))).toBe(false);
  });
});
