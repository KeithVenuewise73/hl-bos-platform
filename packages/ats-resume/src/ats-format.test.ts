import { describe, expect, it } from "vitest";
import { parseResume } from "./resume-parser.ts";
import { validateAtsFormat } from "./ats-format.ts";
import { DEMO_RESUME_TEXT } from "./demo.ts";

describe("validateAtsFormat", () => {
  it("passes a clean single-column resume", () => {
    const findings = validateAtsFormat(DEMO_RESUME_TEXT, parseResume(DEMO_RESUME_TEXT));
    expect(findings.every((f) => f.severity !== "risk")).toBe(true);
  });

  it("flags a layout that looks like columns once flattened", () => {
    const columnar = [
      "Jane Roe                         jane@example.com",
      "EXPERIENCE                       SKILLS",
      "Dispatcher, Acme                 Routing",
      "2019 - 2023                      Dispatch",
      "Ran 40 loads a day               Excel",
    ].join("\n");
    const findings = validateAtsFormat(columnar, parseResume(columnar));
    expect(
      findings.some((f) => f.severity === "risk" && f.message.includes("multi-column")),
    ).toBe(true);
  });

  it("flags missing contact details, because a parser cannot read a header", () => {
    const noContact =
      "Jane Roe\n\nEXPERIENCE\nDispatcher | Acme | 2019 - 2023\n• Ran 40 loads a day.";
    const findings = validateAtsFormat(noContact, parseResume(noContact));
    expect(findings.some((f) => f.message.includes("No email address"))).toBe(true);
  });

  it("describes what it observed, not what it assumes about the file", () => {
    const columnar = "A    B    C\nD    E    F\nG    H    I\n";
    const findings = validateAtsFormat(columnar, parseResume(columnar));
    expect(findings.some((f) => f.message.startsWith("The extracted text"))).toBe(true);
  });

  it("gives every finding an actionable fix", () => {
    const findings = validateAtsFormat(DEMO_RESUME_TEXT, parseResume(DEMO_RESUME_TEXT));
    expect(findings.every((f) => f.fix.length > 0)).toBe(true);
  });
});
