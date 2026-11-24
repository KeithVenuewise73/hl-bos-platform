/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- tests deliberately mutate untyped JSON to prove the validator rejects it */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CSV_COLUMNS,
  csvToReport,
  importReportV1,
  parseCsv,
  templateCsv,
  toCsv,
  validateImportReport,
} from "./index.ts";

const rd = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const fixture = () => JSON.parse(rd("fixtures/synthetic/weekly-report.synthetic.json"));

describe("committed artefacts are generated from the zod source", () => {
  it("JSON Schema file is current", () => {
    const gen = z.toJSONSchema(importReportV1, {
      target: "draft-2020-12",
      io: "input",
    });
    expect(JSON.parse(rd("schemas/prospect-import.v1.schema.json"))).toEqual(gen);
  });
  it("CSV template file is current", () => {
    expect(rd("templates/prospect-import.v1.template.csv")).toBe(templateCsv());
  });
});

describe("JSON import", () => {
  it("accepts the synthetic fixture", () => {
    const r = validateImportReport(fixture());
    expect(r.ok).toBe(true);
  });
  it("rejects a verified claim without a source", () => {
    const f = fixture();
    f.prospects[0].scoresheet_provider.source_urls = [];
    const r = validateImportReport(f);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues[0]).toMatchObject({
        row: 1,
        path: "prospects.0.scoresheet_provider.source_urls",
      });
  });
  it("rejects a value with status unknown and a null value with status inferred", () => {
    const a = fixture();
    a.prospects[0].registration_provider = {
      value: "X",
      status: "unknown",
      source_urls: [],
    };
    const b = fixture();
    b.prospects[0].registration_provider = {
      value: null,
      status: "inferred",
      source_urls: [],
    };
    expect(validateImportReport(a).ok).toBe(false);
    expect(validateImportReport(b).ok).toBe(false);
  });
  it("rejects duplicate external_ref inside a report", () => {
    const f = fixture();
    f.prospects[1].external_ref = "synth-001";
    const r = validateImportReport(f);
    expect(
      !r.ok && r.issues.some((i) => /duplicate external_ref/.test(i.message)),
    ).toBe(true);
  });
  it("keeps synthetic data and real data apart in both directions", () => {
    const real = fixture();
    real.report.is_synthetic = false;
    const r1 = validateImportReport(real);
    expect(!r1.ok && r1.issues.some((i) => /SYNTH-/.test(i.message))).toBe(true);
    const fake = fixture();
    fake.prospects[0].official_website = "https://realleague.org";
    const r2 = validateImportReport(fake);
    expect(
      !r2.ok && r2.issues.some((i) => /reserved example domain/.test(i.message)),
    ).toBe(true);
  });
  it("rejects unknown major versions, bad urls, javascript: urls, bad dates", () => {
    for (const mut of [
      (f: any) => {
        f.schema_version = "2.0.0";
      },
      (f: any) => {
        f.prospects[0].official_website = "not a url";
      },
      (f: any) => {
        f.prospects[0].source_urls = ["javascript:alert(1)"];
      },
      (f: any) => {
        f.prospects[0].research_date = "01/04/2026";
      },
      (f: any) => {
        f.prospects[0].location.country = "MX";
      },
      (f: any) => {
        f.prospects = [];
      },
    ]) {
      const f = fixture();
      mut(f);
      expect(validateImportReport(f).ok).toBe(false);
    }
  });
  it("rejects a decision-maker with no public source", () => {
    const f = fixture();
    f.prospects[0].decision_makers[0].source_urls = [];
    expect(validateImportReport(f).ok).toBe(false);
  });
});

describe("CSV", () => {
  it("parses RFC 4180 edge cases", () => {
    expect(parseCsv('﻿a,"b,1","c ""q"""\r\n"x\ny",,z\n')).toEqual([
      ["a", "b,1", 'c "q"'],
      ["x\ny", "", "z"],
    ]);
    expect(() => parseCsv('a,"open')).toThrow(/unterminated/);
  });
  it("round-trips through toCsv", () => {
    const rows = [["a", 'b"c', "d,e", "f\ng"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("template header matches the contract and the example row converts and validates", () => {
    const t = parseCsv(templateCsv());
    expect(t[0]).toEqual([...CSV_COLUMNS]);
    expect(t[1]!.length).toBe(CSV_COLUMNS.length);
    const r = csvToReport(templateCsv());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.report.report.is_synthetic).toBe(true);
      expect(r.report.prospects[0]!.verified_facts[0]!.source_urls).toHaveLength(1);
      expect(r.report.prospects[0]!.operational_needs.map((n) => n.status)).toEqual([
        "verified",
        "inferred",
      ]);
    }
  });
  const mutate = (col: string, val: string, rowIdx = 1) => {
    const t = parseCsv(templateCsv());
    t[rowIdx]![t[0]!.indexOf(col)] = val;
    return toCsv(t);
  };
  it("reports the CSV row and column for errors", () => {
    const r = csvToReport(mutate("priority", "urgent"));
    expect(!r.ok && r.issues[0]).toMatchObject({
      row: 2,
      path: "prospects.0.priority",
    });
  });
  it("rejects bad numbers, missing and unknown columns, verified-without-source", () => {
    expect(csvToReport(mutate("team_count", "twelve")).ok).toBe(false);
    expect(csvToReport(mutate("scoresheet_provider_status", "verified")).ok).toBe(
      false,
    );
    const t = parseCsv(templateCsv());
    t[0]![0] = "bogus";
    const r = csvToReport(toCsv(t));
    expect(!r.ok && r.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        'unknown column "bogus"',
        'missing column "schema_version"',
      ]),
    );
    expect(csvToReport("a,b\r\n").ok).toBe(false);
  });
});
