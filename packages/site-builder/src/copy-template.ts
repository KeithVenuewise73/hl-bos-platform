// The template writer: deterministic copy from facts alone. Always available,
// needs no key, and is the fallback whenever a Claude draft fails the guard.
// Offerings are typical examples for the business's category, marked SAMPLE
// on the page -- we do not know what this business actually offers.

import type { Offering, SiteCopy, SiteFacts, SiteVertical } from "./types.ts";
import { LIMITS } from "./validate.ts";

interface Pack {
  match: RegExp;
  noun: string;
  /** How the business is described in a sentence, when Google gave no category. */
  described?: string;
  offerings: [string, string][];
}

const sample = (pairs: [string, string][]): Offering[] =>
  pairs.map(([name, description]) => ({ name, description, sample: true }));

const PACKS: Record<SiteVertical, Pack[]> = {
  contractor: [
    {
      match: /roof/i,
      noun: "Roofing",
      offerings: [
        [
          "Roof repairs",
          "Leaks, missing shingles, flashing and storm damage, looked at and fixed.",
        ],
        [
          "Roof replacement",
          "Tear-off and new roofs, with the options explained before work starts.",
        ],
        [
          "Gutters",
          "Gutter cleaning, repair and new gutters to keep water off the house.",
        ],
        [
          "Inspections and estimates",
          "A walk-through of the roof and a written estimate for the work.",
        ],
      ],
    },
    {
      match: /plumb|drain|septic/i,
      noun: "Plumbing",
      offerings: [
        ["Repairs", "Leaks, clogs, running toilets and dripping faucets."],
        ["Water heaters", "Water heater repair and replacement."],
        [
          "Fixtures and remodels",
          "Sinks, toilets, showers and new plumbing for remodels.",
        ],
        ["Drain cleaning", "Slow and blocked drains cleared."],
      ],
    },
    {
      match: /electric/i,
      noun: "Electrical work",
      described: "electrical business",
      offerings: [
        [
          "Repairs and troubleshooting",
          "Outlets, switches, breakers and circuits that are not working.",
        ],
        ["Panel upgrades", "Electrical panel and service upgrades."],
        ["Lighting", "Indoor and outdoor lighting, fixtures and ceiling fans."],
        ["New circuits", "Circuits for kitchens, additions, garages and appliances."],
      ],
    },
    {
      match: /pav|asphalt|concrete|mason/i,
      noun: "Paving and masonry",
      described: "paving and masonry business",
      offerings: [
        ["Driveways", "New driveways, resurfacing and repairs."],
        ["Sealcoating and repairs", "Crack filling, patching and sealcoating."],
        ["Walkways and patios", "Walkways, patios and steps."],
        ["Estimates", "An on-site look at the job and a written estimate."],
      ],
    },
    {
      match: /landscap|lawn|tree|snow/i,
      noun: "Landscaping",
      offerings: [
        ["Lawn care", "Mowing, edging and seasonal lawn care."],
        ["Landscape design", "Planting beds, shrubs and garden layouts."],
        ["Cleanups", "Spring and fall cleanups."],
        ["Hardscaping", "Patios, walls and walkways."],
      ],
    },
    {
      match: /hvac|heat|cool|air cond|furnace/i,
      noun: "Heating and cooling",
      described: "heating and cooling business",
      offerings: [
        ["Heating repair", "Furnace and boiler repair."],
        ["Cooling repair", "Air conditioning repair."],
        ["Installations", "New furnaces, air conditioners and heat pumps."],
        ["Maintenance", "Seasonal tune-ups and filter service."],
      ],
    },
    {
      match: /paint/i,
      noun: "Painting",
      offerings: [
        ["Interior painting", "Walls, ceilings, trim and doors."],
        ["Exterior painting", "Siding, trim, decks and fences."],
        ["Prep and repairs", "Patching, sanding and priming before paint."],
        ["Estimates", "A walk-through of the job and a written estimate."],
      ],
    },
    {
      match: /./,
      noun: "Home services",
      described: "home services business",
      offerings: [
        ["Repairs", "Fixing what is broken, inside and outside the house."],
        ["Improvements", "Upgrades and remodeling projects."],
        ["Maintenance", "Seasonal and routine upkeep."],
        ["Estimates", "An on-site look at the job and a written estimate."],
      ],
    },
  ],
  salon_barber: [
    {
      match: /barber/i,
      noun: "Barbershop",
      offerings: [
        ["Haircuts", "Classic cuts, fades and tapers."],
        ["Beard trims", "Beard shaping, line-ups and trims."],
        ["Hot towel shaves", "A traditional straight-razor shave."],
        ["Kids' cuts", "Haircuts for younger customers."],
      ],
    },
    {
      match: /nail/i,
      noun: "Nail salon",
      offerings: [
        ["Manicures", "Classic and gel manicures."],
        ["Pedicures", "Classic and spa pedicures."],
        ["Nail art", "Designs and finishes."],
        ["Enhancements", "Acrylic and gel extensions."],
      ],
    },
    {
      match: /./,
      noun: "Hair salon",
      offerings: [
        ["Cuts and styling", "Cuts, blowouts and styling."],
        ["Color", "All-over color, highlights and balayage."],
        ["Treatments", "Conditioning and repair treatments."],
        ["Special occasions", "Styling for weddings and events."],
      ],
    },
  ],
  restaurant_bar: [
    {
      match: /pizz/i,
      noun: "Pizzeria",
      offerings: [
        ["Pizza", "Pies and slices."],
        ["Wings", "Wings and sides."],
        ["Subs and salads", "Subs, wraps and salads."],
        ["Takeout and delivery", "Order ahead for pickup."],
      ],
    },
    {
      match: /bar|pub|tavern|brew|saloon/i,
      noun: "Bar and grill",
      described: "bar and grill",
      offerings: [
        ["Drinks", "Beer, wine and cocktails."],
        ["Food", "Burgers, wings and bar favorites."],
        ["Game days", "Watch the game with friends."],
        ["Gatherings", "Room for groups and get-togethers."],
      ],
    },
    {
      match: /./,
      noun: "Restaurant",
      offerings: [
        ["Starters", "Plates to share."],
        ["Mains", "Main dishes and specials."],
        ["Drinks", "Something to go with the meal."],
        ["Takeout", "Order ahead and pick up."],
      ],
    },
  ],
};

const ACTION: Record<SiteVertical, { verb: string; cta: string }> = {
  contractor: { verb: "to ask about a job", cta: "Tell us about your project" },
  salon_barber: {
    verb: "to book your next visit",
    cta: "Ready for your next appointment?",
  },
  restaurant_bar: {
    verb: "to order ahead or plan a visit",
    cta: "Hungry? Call ahead or stop in",
  },
};

export function packFor(facts: SiteFacts): Pack {
  const text = `${facts.category ?? ""} ${facts.businessName}`;
  const packs = PACKS[facts.vertical];
  return packs.find((p) => p.match.test(text)) ?? packs[packs.length - 1]!;
}

const aOrAn = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

const fit = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;

export function templateCopy(facts: SiteFacts): SiteCopy {
  const pack = packFor(facts);
  const { verb, cta } = ACTION[facts.vertical];
  const where = facts.city ? ` in ${facts.city}` : "";
  const kind = facts.category ?? pack.noun;
  // "a roofing contractor" from Google's category; otherwise "a roofing business".
  const described = facts.category
    ? facts.category.toLowerCase()
    : (pack.described ??
      (/shop|salon|restaurant|pizzeria/i.test(pack.noun)
        ? pack.noun.toLowerCase()
        : `${pack.noun.toLowerCase()} business`));
  const reach = facts.phone
    ? `Call or text ${facts.phone} ${verb}.`
    : `Get in touch ${verb}.`;

  const titleTail = ` | ${kind}${where}`;
  const seoTitle =
    facts.businessName.length + titleTail.length <= LIMITS.seoTitle
      ? `${facts.businessName}${titleTail}`
      : fit(facts.businessName, LIMITS.seoTitle);

  return {
    seoTitle,
    metaDescription: fit(
      `${facts.businessName}: ${kind.toLowerCase()}${where}. ${reach}`,
      LIMITS.metaDescription,
    ),
    heroEyebrow: fit(`${kind}${where}`, LIMITS.heroEyebrow),
    heroHeadline: fit(facts.businessName, LIMITS.heroHeadline),
    heroSubhead: fit(`${pack.noun}${where}. ${reach}`, LIMITS.heroSubhead),
    aboutHeading: `About ${fit(facts.businessName, LIMITS.aboutHeading - 6)}`,
    aboutBody: fit(
      `${facts.businessName} is ${aOrAn(described)} ${described}${where}. This is where the owner's own story goes: how the business started, the people behind it, and what customers can expect.`,
      LIMITS.aboutBody,
    ),
    aboutSample: true,
    offeringsHeading:
      facts.vertical === "restaurant_bar" ? "On the menu" : "What we do",
    offeringsIntro:
      "Examples to show the layout. Replace them with the real list before launch.",
    offerings: sample(pack.offerings),
    ctaHeading: cta,
    ctaBody: reach,
  };
}
