import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_SQL,
  HLD_TENANT_SLUG,
  lit,
  REPORT_SQL,
  SHOPS_SQL,
  summarise,
  toShopRow,
} from "./shop-audit-sql";

/**
 * The Shop Analysis page's mapping layer.
 *
 * The statements themselves are exercised against a real PostgreSQL carrying
 * the same migrations (scripts/local-test); what is tested here is the part
 * that decides what the CEO reads -- above all, the three different reasons a
 * score can be absent, which must never collapse into one.
 */

describe("a missing score is never the same as a zero", () => {
  it("a shop nobody has looked at has no run and says so", () => {
    const s = toShopRow({
      prospect_id: "p1",
      source_row: 3,
      business_name: "Burns Barber Shop",
      website_url: "https://example.test/",
      run_id: null,
      status: null,
      score: null,
      confidence: null,
    });
    expect(s.status).toBe("not_analysed");
    expect(s.score).toBeNull();
    expect(s.runId).toBeNull();
  });

  it("a shop we could not read is analysed, with no score", () => {
    const s = toShopRow({
      prospect_id: "p2",
      source_row: 4,
      business_name: "Legacy Barbershop",
      website_url: "https://down.test/",
      run_id: "r2",
      status: "partially_completed",
      score: null,
      confidence: "unknown",
    });
    expect(s.status).toBe("partially_completed");
    expect(s.score).toBeNull();
    expect(s.confidence).toBe("unknown");
  });

  it("a shop with nothing online is scored zero, which is a real finding", () => {
    const s = toShopRow({
      prospect_id: "p3",
      source_row: 2,
      business_name: "88 South Barbershop",
      website_url: null,
      run_id: "r3",
      status: "completed",
      score: 0,
      confidence: "inferred",
    });
    expect(s.score).toBe(0);
    expect(s.status).toBe("completed");
  });
});

describe("row mapping", () => {
  it("splits the comma-joined capability list, and empties to []", () => {
    expect(
      toShopRow({ prospect_id: "p", capabilities: "owned_website,booking" })
        .capabilities,
    ).toEqual(["owned_website", "booking"]);
    expect(toShopRow({ prospect_id: "p", capabilities: null }).capabilities).toEqual(
      [],
    );
    expect(toShopRow({ prospect_id: "p", capabilities: "" }).capabilities).toEqual([]);
  });

  it("keeps absent text fields null rather than turning them into 'null'", () => {
    const s = toShopRow({ prospect_id: "p", locality: null, phone: undefined });
    expect(s.locality).toBeNull();
    expect(s.phone).toBeNull();
  });
});

describe("campaign summary", () => {
  const rows = [
    { status: "completed", score: 0, websiteUrl: null },
    { status: "completed", score: 96, websiteUrl: "https://a.test/" },
    { status: "partially_completed", score: null, websiteUrl: null },
    { status: "not_analysed", score: null, websiteUrl: "https://b.test/" },
    { status: "not_analysed", score: null, websiteUrl: null },
  ].map(
    (r) =>
      ({ ...toShopRow({ prospect_id: "x" }), ...r }) as ReturnType<typeof toShopRow>,
  );

  it("counts what is analysed and what is not", () => {
    const s = summarise("k", "n", rows);
    expect(s.shops).toBe(5);
    expect(s.analysed).toBe(3);
    expect(s.awaiting).toBe(2);
    expect(s.completed).toBe(2);
    expect(s.partial).toBe(1);
  });

  it("counts as fetchable ONLY unanalysed shops that have a website", () => {
    // The fifth row has no website and no run. Pressing the button would do
    // nothing for it, so promising it would be a lie about what the button does.
    expect(summarise("k", "n", rows).fetchable).toBe(1);
  });
});

describe("SQL construction", () => {
  it("escapes a single quote by doubling it", () => {
    expect(lit("O'Hara")).toBe("'O''Hara'");
    expect(lit("plain")).toBe("'plain'");
  });

  it("inlines the tenant and campaign as quoted literals", () => {
    const sql = SHOPS_SQL(HLD_TENANT_SLUG, "wny_barbers_50");
    expect(sql).toContain("'herman-legacy-digital'");
    expect(sql).toContain("'wny_barbers_50'");
  });

  it("a quote in an identifier cannot end the literal early", () => {
    const sql = CAMPAIGN_SQL("herman-legacy-digital", "x'; drop table foo; --");
    expect(sql).toContain("'x''; drop table foo; --'");
    expect(sql).not.toContain("'x'; drop");
  });

  it("casts the shop id to uuid, so a malformed id fails instead of running", () => {
    expect(REPORT_SQL(HLD_TENANT_SLUG, "not-a-uuid")).toContain("'not-a-uuid'::uuid");
  });

  it("keeps shops without a run: the join must be a LEFT join", () => {
    // A shop that drops out of the list would make the page quietly shorter
    // than the spreadsheet, and imply the missing ones were fine.
    const sql = SHOPS_SQL(HLD_TENANT_SLUG, "wny_barbers_50");
    expect(sql).toContain("left join latest lr");
  });

  it("orders recommendations structural-first, not by enum declaration order", () => {
    expect(
      REPORT_SQL(HLD_TENANT_SLUG, "00000000-0000-0000-0000-000000000000"),
    ).toContain("(rc.priority <> 'structural')");
  });
});

describe("a blank score has two different reasons, and they are not the same", () => {
  // Found by looking at the rendered page: five shops read "could not be read"
  // when nobody had ever tried to open their site. Both cases have no score and
  // 'unknown' confidence, so the difference has to be carried in the data.
  it("a site that did not answer is marked unreachable", () => {
    const s = toShopRow({
      prospect_id: "p",
      run_id: "r",
      status: "partially_completed",
      score: null,
      confidence: "unknown",
      unreachable: true,
    });
    expect(s.unreachable).toBe(true);
  });

  it("a shop analysed from the list alone is NOT marked unreachable", () => {
    const s = toShopRow({
      prospect_id: "p",
      run_id: "r",
      status: "partially_completed",
      score: null,
      confidence: "unknown",
      unreachable: false,
    });
    expect(s.unreachable).toBe(false);
  });

  it("defaults to not-unreachable when the column is absent", () => {
    // Never claim a site failed on missing information.
    expect(toShopRow({ prospect_id: "p" }).unreachable).toBe(false);
  });

  it("asks the database for the distinction rather than inferring it", () => {
    expect(SHOPS_SQL(HLD_TENANT_SLUG, "c")).toContain("'website_unreachable'");
  });
});
