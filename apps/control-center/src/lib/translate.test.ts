import { describe, it, expect } from "vitest";
import { explain, needsCeo, RULE_COUNT } from "./translate";

describe("explain", () => {
  // The exact failure from PR #5. This is the headline requirement from the
  // brief: "Database tests failed because two users shared the same email",
  // NOT "users_email_partial_key violation".
  it("translates the real PR #5 failure into plain English", () => {
    const raw =
      'ERROR: duplicate key value violates unique constraint "users_email_partial_key"\n' +
      "DETAIL: Key (email)=(dupe@example.test) already exists.";
    const e = explain(raw);
    expect(e.headline).toBe(
      "A test tried to create two accounts with the same email address.",
    );
    expect(e.owner).toBe("ai-engineer");
    expect(needsCeo(e)).toBe(false);
  });

  it("never puts jargon in the headline", () => {
    const jargon = [
      'duplicate key value violates unique constraint "users_email_partial_key"',
      'new row violates row-level security policy for table "membership_roles"',
      "HttpError: Resource not accessible by integration Status: 403",
      "ERR_PNPM_NO_MATCHING_VERSION",
      "# Looks like you planned 14 tests but ran 3",
    ];
    for (const raw of jargon) {
      const h = explain(raw).headline;
      expect(h, `headline for: ${raw}`).not.toMatch(
        /_key|SQLSTATE|ERR_|HttpError|42501|23505|violates|constraint/i,
      );
      expect(h.endsWith(".")).toBe(true);
    }
  });

  it("keeps the raw text available for the engineer", () => {
    const raw =
      'duplicate key value violates unique constraint "users_email_partial_key"';
    expect(explain(raw).detail).toBe(raw);
  });

  it("routes a GitHub sign-in problem to the CEO -- it is the one thing only he can fix", () => {
    const e = explain("fatal: could not read Username for 'https://github.com'");
    expect(e.owner).toBe("ceo");
    expect(needsCeo(e)).toBe(true);
  });

  it("routes engineering failures away from the CEO", () => {
    const engineering = [
      "Code style issues found in 6 files",
      "planned 14 tests but ran 3",
      "Resource not accessible by integration",
      "new row violates row-level security policy",
    ];
    for (const raw of engineering) {
      expect(needsCeo(explain(raw)), raw).toBe(false);
    }
  });

  it("admits when it has no explanation rather than inventing one", () => {
    const e = explain("SIGSEGV: segmentation fault at 0x7fff");
    expect(e.owner).toBe("ai-engineer");
    expect(e.headline).toMatch(/does not have a plain-English explanation for yet/);
    expect(e.detail).toContain("SIGSEGV");
  });

  it("handles empty output without crashing the dashboard", () => {
    expect(explain("").detail).toBe("(no output)");
    // @ts-expect-error -- defensive: the shell can hand back undefined
    expect(explain(undefined).detail).toBe("(no output)");
  });

  // --- Social publishing (module 0046) --------------------------------
  it("tells Keith when a social account needs re-authorising, and calls it his", () => {
    const e = explain(
      "manual_reauth_required: the LinkedIn 'Share on LinkedIn' tier issues no refresh token",
    );
    expect(e.owner).toBe("ceo");
    expect(e.headline).not.toMatch(/refresh_token|LinkedIn tier|OAuth|scope/i);
    expect(e.headline).toMatch(/sign in again/i);
  });

  it("says plainly that an unconfirmed post was NOT retried, and why", () => {
    const e = explain(
      "ambiguous: no response from Facebook; the post may or may not be live.",
    );
    // The whole point: a CEO reading this must understand the post might be
    // live, and that we chose not to send it twice.
    expect(e.meaning).toMatch(/do not know whether it published/i);
    expect(e.meaning).toMatch(/one post becomes two/i);
    expect(e.owner).toBe("ai-engineer");
  });

  it("does not blame the software for an Instagram account setup rule", () => {
    const e = explain(
      'new row for relation "accounts" violates check constraint "accounts_instagram_requires_linked_page"',
    );
    expect(e.owner).toBe("ceo");
    expect(e.headline).toMatch(/not linked to a Facebook Page/i);
    expect(e.headline).not.toMatch(/constraint|violates|relation/i);
  });

  it("explains a TikTok domain-verification block without jargon in the headline", () => {
    const e = explain("tiktok_url_ownership_unverified: verify the domain");
    expect(e.owner).toBe("ceo");
    expect(e.headline).not.toMatch(/url_ownership_unverified|tiktok_/i);
  });

  it("owns the TikTok draft-vs-published mistake as an engineering fault", () => {
    const e = explain(
      "a tiktok_inbox target cannot be published; it can only be delivered to the inbox",
    );
    expect(e.owner).toBe("ai-engineer");
    expect(needsCeo(e)).toBe(false);
  });

  it("has rules drawn from real failures", () => {
    expect(RULE_COUNT).toBeGreaterThanOrEqual(10);
  });
});
