// Premium Business Sites in the console: build, approve and review a
// multi-page site from a verified Business Profile. Everything is injected,
// so it is tested directly (phase3b.test.ts); the server actions in
// src/actions/premium.ts are thin wrappers. Nothing here publishes anything.

import {
  approvePremiumDraft,
  buildPremiumDraft,
  completenessReport,
  normalizeProfile,
  premiumReviews,
  PremiumDraftError,
  PREMIUM_PAGES,
  premiumTheme,
  type BusinessProfileRepository,
  type CompletenessRow,
  type PremiumDraft,
  type PremiumDraftRepository,
  type ReviewCheck,
} from "@hl-bos/site-builder";

import type { PresenceResult } from "./presence";

export interface PremiumDeps {
  profiles: BusinessProfileRepository;
  premium: PremiumDraftRepository;
  now: () => Date;
  newId: () => string;
  actor: string;
}

export async function buildPremium(
  id: string,
  deps: PremiumDeps,
): Promise<PresenceResult> {
  const raw = await deps.profiles.get(id);
  if (!raw)
    return { ok: false, headline: "Profile not found.", meaning: "Reload the page." };
  const p = normalizeProfile(raw);
  const previous = await deps.premium.getByProfile(id);
  try {
    const t0 = Date.now();
    const d = buildPremiumDraft(p, {
      now: deps.now,
      newId: deps.newId,
      actor: deps.actor,
      previous,
    });
    await deps.premium.save(d);
    const secs = (Date.now() - t0) / 1000;
    return {
      ok: true,
      headline: `Premium site ${previous ? "rebuilt" : "built"}: version ${d.version}, ${PREMIUM_PAGES.length} pages${secs < 0.1 ? "" : ` in ${secs.toFixed(1)} seconds`}.`,
      meaning: `Theme: ${premiumTheme(d.theme).label}. ${d.content.missing.length ? `${d.content.missing.length} item(s) still need information. ` : ""}Private to this computer; nothing was published.`,
      href: `/profiles/${id}/premium`,
    };
  } catch (e) {
    if (e instanceof PremiumDraftError)
      return { ok: false, headline: "Not built.", meaning: e.message };
    throw e;
  }
}

export async function approvePremium(
  id: string,
  deps: PremiumDeps,
): Promise<PresenceResult> {
  const d = await deps.premium.getByProfile(id);
  if (!d)
    return { ok: false, headline: "No premium site yet.", meaning: "Build it first." };
  await deps.premium.save(approvePremiumDraft(d, deps.actor, deps.now()));
  return {
    ok: true,
    headline: "Design approved.",
    meaning:
      "Internal sign-off on the design only. Nothing was published, and no address was configured.",
  };
}

export interface PremiumReview {
  draft: PremiumDraft;
  completeness: CompletenessRow[];
  accessibility: ReviewCheck[];
  performance: ReviewCheck[];
}

/** Everything the review screen shows, computed from what would ship. */
export function premiumReview(d: PremiumDraft, fontBytes: number): PremiumReview {
  const r = premiumReviews(d, fontBytes);
  return { draft: d, completeness: completenessReport(d.content), ...r };
}

/** Headers for serving a premium draft inside the console: private, script-free, same-origin only. */
export const PREMIUM_PREVIEW_CSP =
  "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'";
