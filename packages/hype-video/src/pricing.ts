/**
 * Pricing — a PLACEHOLDER. No payment provider is connected, nothing is
 * charged, and the pricing page says both. These are the plans the business
 * intends to sell, recorded once so the page and any future checkout read
 * the same numbers.
 *
 * Prices are integer cents. A float price is a rounding bug waiting for a
 * refund dispute.
 */

export interface Plan {
  readonly key: string;
  readonly name: string;
  readonly audience: string;
  /** Lowest price in cents. For a range, `maxPriceCents` is the top. */
  readonly priceCents: number;
  readonly maxPriceCents: number | null;
  readonly interval: "one_time" | "month";
  readonly includes: readonly string[];
}

export const PLANS: readonly Plan[] = [
  {
    key: "free_preview",
    name: "Free Preview",
    audience: "Try it",
    priceCents: 0,
    maxPriceCents: null,
    interval: "one_time",
    includes: [
      "Full written hype package",
      "Scripts, captions, hashtags, prompts",
      "Text download",
    ],
  },
  {
    key: "single_package",
    name: "Single Hype Package",
    audience: "One big moment",
    priceCents: 499,
    maxPriceCents: null,
    interval: "one_time",
    includes: [
      "Everything in Free",
      "Rendered video, music and voiceover (when connected)",
    ],
  },
  {
    key: "family_monthly",
    name: "Family Plan",
    audience: "Parents with one or more athletes",
    priceCents: 999,
    maxPriceCents: null,
    interval: "month",
    includes: [
      "Unlimited packages for your family",
      "All templates",
      "Priority rendering",
    ],
  },
  {
    key: "coach_team_monthly",
    name: "Coach / Team Plan",
    audience: "Coaches and team media",
    priceCents: 2995,
    maxPriceCents: null,
    interval: "month",
    includes: [
      "Whole-roster projects",
      "Team intro and Player of the Game",
      "Sponsor callouts",
    ],
  },
  {
    key: "team_package",
    name: "Team Package",
    audience: "Programs, tournaments and events",
    priceCents: 9900,
    maxPriceCents: 29900,
    interval: "one_time",
    includes: [
      "Season or event bundle",
      "Custom branding",
      "5-Star Sports Media production support",
    ],
  },
];

export function formatPrice(plan: Plan): string {
  const dollars = (cents: number): string =>
    cents === 0 ? "Free" : `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
  const base =
    plan.maxPriceCents === null
      ? dollars(plan.priceCents)
      : `${dollars(plan.priceCents)}–${dollars(plan.maxPriceCents)}`;
  return plan.interval === "month" ? `${base}/mo` : base;
}
