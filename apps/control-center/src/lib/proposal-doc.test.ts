import { describe, it, expect } from "vitest";
import {
  assembleDocument,
  callSnapshotOf,
  offerOf,
  referenceOf,
  renderProposal,
  suggestedNextSteps,
  type AuditSnapshot,
  type ProposalDocument,
} from "./proposal-doc";
import type { Gap, ShopStack } from "./capability-match";

const UNKNOWN: ShopStack = {
  ownWebsite: null,
  bookingPlatform: null,
  onlineBooking: null,
  missedCallHandling: null,
  reviewProcess: null,
  clientRecords: null,
  takesWalkIns: null,
  chairs: null,
};

const GAP = (over: Partial<Gap> = {}): Gap => ({
  capability: "owned_website",
  name: "Owned Website / Landing Page",
  because: "No website was found for this shop.",
  recovers: "Customers who look you up and find nothing.",
  deliverableToday: true,
  needsConfirming: false,
  priority: "structural",
  ...over,
});

const DOC = (over: Partial<ProposalDocument> = {}): ProposalDocument => ({
  shop: {
    name: "Truth Barbershop",
    locality: "West Seneca",
    website_url: null,
    phone: null,
  },
  prepared_by: "Herman Legacy Digital",
  prepared_at: "2026-09-11T12:00:00Z",
  message: "",
  audit: null,
  call: null,
  offer: [],
  investment: { lines: [], note: "" },
  next_steps: [],
  ...over,
});

const render = (d: ProposalDocument, isDraft = false) =>
  renderProposal(d, { reference: "AB12CD34", isDraft });

describe("the call, as it is read back to the shop", () => {
  it("is null when nobody has called, which is not the same as an empty call", () => {
    // The renderer prints different sentences for these two, and it must: "we
    // have not spoken to you" and "you told us nothing" are different facts.
    expect(callSnapshotOf(UNKNOWN, null, "")).toBeNull();
    expect(callSnapshotOf(UNKNOWN, "2026-09-11T12:00:00Z", "")).not.toBeNull();
  });

  it("NEVER turns an unasked question into a no", () => {
    // The single most important line in this file. A proposal that says "you
    // have no way to book online" when nobody raised booking is how you get
    // corrected in front of an owner's staff.
    const c = callSnapshotOf(UNKNOWN, "2026-09-11T12:00:00Z", "")!;
    expect(c.said).toHaveLength(0);
    expect(c.not_asked).toHaveLength(6);
  });

  it("keeps a real no as a no", () => {
    const c = callSnapshotOf(
      { ...UNKNOWN, ownWebsite: false },
      "2026-09-11T12:00:00Z",
      "",
    )!;
    expect(c.said).toEqual([{ label: "A website of your own", answer: "no" }]);
    expect(c.not_asked).toHaveLength(5);
  });

  it("names the platform they book on, because that is the whole pitch", () => {
    const c = callSnapshotOf(
      { ...UNKNOWN, onlineBooking: true, bookingPlatform: "GlossGenius" },
      "2026-09-11T12:00:00Z",
      "",
    )!;
    expect(c.said[0]!.detail).toBe("GlossGenius");
  });

  it("does not attach a platform to a shop that says it has no online booking", () => {
    const c = callSnapshotOf(
      { ...UNKNOWN, onlineBooking: false, bookingPlatform: "Booksy" },
      "2026-09-11T12:00:00Z",
      "",
    )!;
    expect(c.said[0]!.detail).toBeUndefined();
  });
});

describe("gaps become offer lines without changing what was promised", () => {
  it("carries deliverable_today through exactly", () => {
    const o = offerOf([
      GAP(),
      GAP({ capability: "client_crm", deliverableToday: false }),
    ]);
    expect(o.map((x) => x.deliverable_today)).toEqual([true, false]);
    expect(o[0]!.capability).toBe("owned_website");
  });

  it("keeps 'ask them' attached to the line it belongs to", () => {
    const o = offerOf([GAP({ needsConfirming: true })]);
    expect(o[0]!.needs_confirming).toBe(true);
  });
});

describe("suggested next steps are derived, never invented", () => {
  it("proposes no build step when nothing is deliverable", () => {
    const steps = suggestedNextSteps(offerOf([GAP({ deliverableToday: false })]), null);
    expect(steps.join(" ")).not.toContain("We build it");
  });

  it("proposes one when something is", () => {
    expect(suggestedNextSteps(offerOf([GAP()]), null).join(" ")).toContain(
      "We build it",
    );
  });

  it("proposes going back over what was never asked", () => {
    const call = callSnapshotOf(UNKNOWN, "2026-09-11T12:00:00Z", "")!;
    expect(suggestedNextSteps([], call).join(" ")).toContain("could not answer");
  });
});

describe("the document says what is missing rather than leaving it out", () => {
  it("names an absent audit", () => {
    const html = render(DOC());
    expect(html).toContain("What we looked at");
    expect(html).toContain("No audit of this shop");
  });

  it("names an absent call", () => {
    expect(render(DOC())).toContain("We have not spoken to you yet");
  });

  it("says pricing is not stated rather than inventing a number", () => {
    const html = render(DOC());
    expect(html).toContain("Pricing is not stated in this document");
    expect(html).not.toMatch(/\$\s*\d/);
  });

  it("says so when nothing is deliverable today", () => {
    expect(
      render(DOC({ offer: offerOf([GAP({ deliverableToday: false })]) })),
    ).toContain("Nothing in this proposal is deliverable today");
  });

  it("states the audit's coverage rather than implying full coverage", () => {
    const audit: AuditSnapshot = {
      run_at: "2026-09-01T00:00:00Z",
      composite: 41,
      coverage: { scored: 2, possible: 4 },
      findings: [],
    };
    const html = render(DOC({ audit }));
    expect(html).toContain("41 out of 100");
    expect(html).toContain("over 2 of the 4 dimensions");
    expect(html).toContain("The remaining 2 dimensions could not be assessed");
  });

  it("gets the grammar right when exactly one dimension is missing", () => {
    // Small, but a document that reads as though nobody proof-read it is a
    // document a barber trusts less with their money.
    const html = render(
      DOC({
        audit: {
          run_at: null,
          composite: 38,
          coverage: { scored: 1, possible: 2 },
          findings: [],
        },
      }),
    );
    expect(html).toContain("The remaining 1 dimension could not be assessed");
    expect(html).toContain("it is not in that number");
  });

  it("handles an audit that scored nothing at all", () => {
    const html = render(
      DOC({
        audit: {
          run_at: null,
          composite: null,
          coverage: { scored: 0, possible: 4 },
          findings: [],
        },
      }),
    );
    expect(html).toContain("could not score");
  });
});

describe("available and roadmap never blur, on the page either", () => {
  it("labels the roadmap section as not available", () => {
    const html = render(
      DOC({
        offer: offerOf([
          GAP(),
          GAP({
            capability: "client_crm",
            name: "Client CRM",
            deliverableToday: false,
          }),
        ]),
      }),
    );
    expect(html).toContain("Where this goes next");
    expect(html).toContain("<strong>not available yet</strong>");
    // ...and the roadmap heading must come AFTER the deliverable one, so a
    // skim-reader never meets an unbuilt module first.
    expect(html.indexOf("What we would do")).toBeLessThan(
      html.indexOf("Where this goes next"),
    );
  });

  it("omits the roadmap section entirely when there is nothing on it", () => {
    expect(render(DOC({ offer: offerOf([GAP()]) }))).not.toContain(
      "Where this goes next",
    );
  });

  it("marks a line we could not observe as one to confirm", () => {
    expect(render(DOC({ offer: offerOf([GAP({ needsConfirming: true })]) }))).toContain(
      "to confirm with you",
    );
  });
});

describe("a draft cannot be mistaken for a sent proposal", () => {
  it("stamps it", () => {
    expect(render(DOC(), true)).toContain("Draft — not sent");
  });
  it("and does not stamp a sent one", () => {
    expect(render(DOC(), false)).not.toContain("Draft — not sent");
  });
});

describe("nothing typed into this document can become markup", () => {
  it("escapes the shop's own name", () => {
    const html = render(
      DOC({ shop: { ...DOC().shop, name: "<script>alert(1)</script>" } }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes a covering note and a price line", () => {
    const html = render(
      DOC({
        message: 'He said "they never call back" & left it there',
        investment: {
          lines: [{ label: "<b>Site</b>", amount: "$1,500", cadence: "once" }],
          note: "",
        },
      }),
    );
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;b&gt;Site&lt;/b&gt;");
  });

  it("escapes an evidence URL rather than trusting what was crawled", () => {
    const html = render(
      DOC({
        audit: {
          run_at: null,
          composite: null,
          coverage: { scored: 0, possible: 1 },
          findings: [
            {
              code: "no_ssl",
              dimension: "website",
              statement: "The site is served over http",
              evidence_url: 'http://x.test/"><script>',
              confidence: "verified",
              severity: "high",
            },
          ],
        },
      }),
    );
    expect(html).not.toContain('"><script>');
  });
});

describe("the finished page", () => {
  it("is a standalone document with its own print rules and no external anything", () => {
    const html = render(DOC({ offer: offerOf([GAP()]) }));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("@page");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/(?!x\.test)[^"']*\.(css|js|woff)/);
  });

  it("is not indexable", () => {
    expect(render(DOC())).toContain('name="robots" content="noindex"');
  });

  it("closes by saying where every claim came from", () => {
    expect(render(DOC())).toContain("or from what you told us directly");
  });

  it("quotes a reference short enough to read down a phone", () => {
    expect(referenceOf("3f2a9c17-0000-0000-0000-000000000000")).toBe("3F2A9C17");
  });
});

describe("assembly", () => {
  it("produces a document whose offer matches the gaps it was given", () => {
    const d = assembleDocument({
      shop: {
        name: "Truth Barbershop",
        locality: null,
        website_url: null,
        phone: null,
      },
      audit: null,
      stack: UNKNOWN,
      answeredAt: null,
      notes: "",
      gaps: [GAP()],
      preparedAt: "2026-09-11T12:00:00Z",
    });
    expect(d.offer).toHaveLength(1);
    expect(d.call).toBeNull();
    expect(d.investment.lines).toHaveLength(0);
    expect(d.prepared_by).toBe("Herman Legacy Digital");
  });

  it("leaves the words empty for a person to write", () => {
    const d = assembleDocument({
      shop: { name: "x", locality: null, website_url: null, phone: null },
      audit: null,
      stack: UNKNOWN,
      answeredAt: null,
      notes: "",
      gaps: [GAP()],
      preparedAt: "2026-09-11T12:00:00Z",
    });
    expect(d.message).toBe("");
  });
});
