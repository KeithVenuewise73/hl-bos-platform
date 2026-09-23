import { describe, expect, it } from "vitest";

import { approvalQueue } from "./approvals";
import { assessTexting, type OutboxSummary } from "./texting";
import { explain } from "./translate";

// The real outbox summary, read from HomeHuddle production on 2026-09-23.
// Twilio stopped accepting texts on 2026-08-23 and nobody knew for a month,
// because the "texts are failing" alert was itself a text.
const REAL_OUTAGE: OutboxSummary = {
  total: 559,
  last_sent_at: "2026-08-23 18:28:00.984+00",
  latest_outcome: "failed",
  failed_since: 178,
  failing_since: "2026-08-23 21:00:02.971061+00",
  latest_error:
    "authentication failed, account ACexampleaccountid with status 4 is not active",
  pending: 0,
  oldest_pending: null,
  newest_row_at: "2026-09-23 13:00:00.14632+00",
};
const NOW = new Date("2026-09-23T16:00:00Z");

const HEALTHY: OutboxSummary = {
  ...REAL_OUTAGE,
  last_sent_at: "2026-09-23 13:00:05+00",
  latest_outcome: "sent",
  failed_since: 0,
  failing_since: null,
  latest_error: null,
};

describe("assessTexting", () => {
  it("raises the real outage as red, owned by the CEO, in plain English", () => {
    const a = assessTexting(REAL_OUTAGE, NOW);
    expect(a.health).toBe("red");
    expect(a.owner).toBe("ceo");
    expect(a.headline).toBe("HomeHuddle texts are not reaching families.");
    expect(a.summary).toContain("178 texts have failed since Aug 23, 5:00 PM");
    expect(a.summary).toContain("Aug 23, 2:28 PM (30 days ago)");
    expect(a.reason).toMatch(/Twilio has switched off the account/);
    expect(a.reason).toMatch(/console\.twilio\.com/);
    // Jargon stays out of the words he reads; it is kept for the engineer.
    expect(`${a.headline} ${a.summary} ${a.reason}`).not.toMatch(/status 4|ACexample/);
    expect(a.detail).toContain("status 4 is not active");
  });

  it("explains the earlier 'Authenticate' failure too", () => {
    const a = assessTexting({ ...REAL_OUTAGE, latest_error: "Authenticate" }, NOW);
    expect(a.health).toBe("red");
    expect(a.owner).toBe("ceo");
    expect(a.reason).toMatch(/refusing HomeHuddle's login/);
  });

  it("leaves GitHub sign-in failures to the GitHub rule", () => {
    const e = explain("fatal: Authentication failed for 'https://github.com/x/y.git/'");
    expect(e.headline).toBe("GitHub could not confirm who you are.");
  });

  it("is green only when the newest attempt actually got through", () => {
    const a = assessTexting(HEALTHY, NOW);
    expect(a.health).toBe("green");
    expect(a.summary).toContain("Sep 23, 9:00 AM");
  });

  it("catches texts stuck in the queue as an engineering problem", () => {
    const a = assessTexting(
      { ...HEALTHY, pending: 4, oldest_pending: "2026-09-23 15:20:00+00" },
      NOW,
    );
    expect(a.health).toBe("red");
    expect(a.owner).toBe("ai-engineer");
    expect(a.summary).toMatch(/40 minutes/);
  });

  it("does not call a freshly queued text stuck", () => {
    const a = assessTexting(
      { ...HEALTHY, pending: 1, oldest_pending: "2026-09-23 15:58:00+00" },
      NOW,
    );
    expect(a.health).toBe("green");
  });

  it("notices when HomeHuddle stops writing texts at all", () => {
    const a = assessTexting(
      { ...HEALTHY, newest_row_at: "2026-09-20 13:00:00+00" },
      NOW,
    );
    expect(a.health).toBe("yellow");
    expect(a.owner).toBe("ai-engineer");
  });

  it("never shows green when there is nothing to judge", () => {
    const a = assessTexting({ ...HEALTHY, total: 0 }, NOW);
    expect(a.health).toBe("unknown");
  });
});

describe("texting alarm in the decision queue", () => {
  const gh = { connected: true, pulls: [] } as never;

  it("puts a CEO-owned outage first, with a link to fix it", () => {
    const q = approvalQueue({
      gh,
      health: "green",
      milestone: null,
      texting: assessTexting(REAL_OUTAGE, NOW),
    });
    expect(q[0]?.title).toBe("HomeHuddle texts are not reaching families.");
    expect(q[0]?.href).toBe("https://console.twilio.com");
    expect(q[0]?.urgency).toBe("now");
  });

  it("does not ask the CEO to act on engineering problems or healthy texts", () => {
    const stuck = assessTexting(
      { ...HEALTHY, pending: 4, oldest_pending: "2026-09-23 15:20:00+00" },
      NOW,
    );
    for (const texting of [stuck, assessTexting(HEALTHY, NOW)]) {
      expect(approvalQueue({ gh, health: "green", milestone: null, texting })).toEqual(
        [],
      );
    }
  });
});
