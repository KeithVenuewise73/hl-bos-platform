// The site vertical registry. Everything the builder needs to know about a
// kind of business lives in ONE entry here: its sample-content packs, sections,
// calls to action, required facts, modules, checklist steps, schema type,
// accent colour and which renderer draws it. The builder, renderer, template
// writer and checklist read this table; none of them branch on a vertical by
// name. Adding a vertical = adding an entry and its tests.
//
// The three Phase 2 entries hold exactly the data Phase 2 used (pinned by the
// golden files in __golden__).

import type { ChecklistItem, Offering, SiteFacts, SiteVertical } from "./types.ts";

export type LocalVertical = Exclude<SiteVertical, "professional_services">;

export interface Pack {
  match: RegExp;
  noun: string;
  /** How the business is described in a sentence, when Google gave no category. */
  described?: string;
  offerings: [string, string][];
  /** Professional services: the extra sample sections for this kind of firm. */
  pro?: {
    challenges: [string, string][];
    process: [string, string][];
    industries: [string, string][];
  };
}

export const sample = (pairs: [string, string][]): Offering[] =>
  pairs.map(([name, description]) => ({ name, description, sample: true }));

export type SiteSection =
  | "banner"
  | "header"
  | "hero"
  | "challenges"
  | "offerings"
  | "process"
  | "industries"
  | "experience"
  | "proof"
  | "tools"
  | "about"
  | "visit"
  | "video"
  | "cta"
  | "contact"
  | "footer";

/** Capabilities a vertical's site offers or plans for. */
export type SiteModule =
  | "calls_texts"
  | "directions"
  | "booking"
  | "ordering"
  | "menu"
  | "estimates"
  | "consultation"
  | "lead_capture";

/** Facts a build needs. "contact" = a phone number or an email address. */
export type RequiredFact = "name" | "contact" | "city";

export interface SiteVerticalDef {
  key: SiteVertical;
  label: string;
  /** For sentences: "contractors", "salons/barbers". */
  plural: string;
  /** schema.org type for the JSON-LD block. */
  schemaType: (facts: SiteFacts) => string;
  accent: { accent: string; dark: string; soft: string };
  /** The main button. */
  primaryCta: string;
  /** Sentence fragments for the template writer. */
  action: { verb: string; cta: string };
  offeringsHeading: string;
  packs: Pack[];
  /** Page sections in order. */
  sections: SiteSection[];
  modules: SiteModule[];
  /** What a lead must have before a demo is built (batch "needs information"). */
  requiredFacts: RequiredFact[];
  /** Business Profile fields an internal draft needs before launch. */
  requiredProfileFields: string[];
  /** Vertical-specific launch checklist steps, inserted after calls and texts. */
  checklist: (f: SiteFacts, has: (key: string) => boolean) => ChecklistItem[];
  renderer: "local" | "professional";
  validation: { minOfferings: number; maxOfferings: number; itemNameMax: number };
}

const LOCAL_PACKS: Record<LocalVertical, Pack[]> = {
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

/** Professional-services packs, one per subtype (presence-scanner PROFESSIONAL_SUBTYPES). */
const PRO_PACKS: (Pack & { subtype: string })[] = [
  {
    subtype: "business_transformation",
    match: /^business_transformation$/,
    noun: "Business transformation",
    described: "business transformation consultancy",
    offerings: [
      [
        "Digital presence assessment",
        "A clear look at how customers find the business online and where they drop away.",
      ],
      [
        "Website creation and modernization",
        "A modern website built around the actions customers need to take.",
      ],
      [
        "Lead capture and customer contact",
        "Calls, forms, booking and follow-up arranged so enquiries are not lost.",
      ],
      [
        "Business process improvement",
        "Practical changes to the everyday work behind sales and service.",
      ],
    ],
    pro: {
      challenges: [
        ["Hard to find online", "Customers search and find someone else first."],
        ["Enquiries slip away", "Calls and messages go unanswered or untracked."],
        [
          "Manual, repeated work",
          "Staff time goes to tasks a simple system could handle.",
        ],
        [
          "Tools that do not connect",
          "Information is typed in twice and still goes missing.",
        ],
      ],
      process: [
        [
          "Assess",
          "Look at the business as a customer sees it, and at how the work gets done.",
        ],
        ["Plan", "Agree the few changes that matter most, in order."],
        ["Build", "Put the website, tools and processes in place."],
        ["Support", "Keep them running and improving."],
      ],
      industries: [
        ["Contractors and home services", "Trades and home service businesses."],
        ["Salons and barbers", "Appointment-based personal services."],
        ["Restaurants and bars", "Food and hospitality businesses."],
        ["Local service businesses", "Other owner-led local businesses."],
      ],
    },
  },
  {
    subtype: "transport_operations",
    match: /^transport_operations$/,
    noun: "Transportation and operations consulting",
    described: "transportation and operations consultancy",
    offerings: [
      [
        "Operational assessments",
        "A structured look at how deliveries, routes and people perform today.",
      ],
      [
        "Dispatch and routing",
        "Planning routes and dispatch so the day runs as designed.",
      ],
      [
        "Final-mile and delivery operations",
        "Delivery operations organised around the customer's experience.",
      ],
      [
        "Driver and contractor performance",
        "Clear measures and routines for the people doing the work.",
      ],
    ],
    pro: {
      challenges: [
        [
          "Late or missed deliveries",
          "Customers wait, and the cost of fixing it adds up.",
        ],
        [
          "Routes that waste time",
          "Plans that look fine on paper but not on the road.",
        ],
        [
          "Unclear performance",
          "No shared view of how drivers and contractors are doing.",
        ],
        ["Decisions without data", "Reports arrive too late to change the day."],
      ],
      process: [
        ["Assess", "Understand the operation as it really runs."],
        ["Diagnose", "Find the gaps that cost the most."],
        ["Design", "Agree practical changes and how to measure them."],
        ["Support", "Help put the changes in place and keep them working."],
      ],
      industries: [
        ["Final-mile delivery", "Home and business delivery operations."],
        ["Distribution and warehousing", "Operations that move and store goods."],
        ["Retail delivery", "Retailers delivering to their customers."],
        ["Regional fleets", "Local and regional transportation operations."],
      ],
    },
  },
  {
    subtype: "accounting",
    match: /^accounting$/,
    noun: "Accounting",
    described: "accounting practice",
    offerings: [
      ["Bookkeeping", "Keeping the books accurate and up to date."],
      ["Tax preparation", "Individual and business tax returns."],
      ["Payroll", "Running payroll and the filings that go with it."],
      ["Advisory", "Help with planning and financial decisions."],
    ],
    pro: {
      challenges: [
        ["Books behind", "Records that are never quite current."],
        ["Tax-time stress", "Paperwork gathered in a rush."],
        ["Unclear numbers", "Hard to see how the business is really doing."],
      ],
      process: [
        ["Introductory call", "Talk through what the client needs."],
        ["Gather records", "Collect what the work requires."],
        ["Do the work", "Prepare, file or advise."],
        ["Stay in touch", "Plan ahead for the next period."],
      ],
      industries: [
        ["Individuals and families", "Personal tax and finances."],
        ["Small businesses", "Owner-led companies."],
        ["Self-employed", "Sole traders and contractors."],
      ],
    },
  },
  {
    subtype: "insurance",
    match: /^insurance$/,
    noun: "Insurance",
    described: "insurance agency",
    offerings: [
      ["Home and auto", "Cover for the home and the car."],
      ["Business insurance", "Cover for business owners."],
      ["Life insurance", "Protection for the people who depend on you."],
      ["Policy check-ups", "A look at existing cover to see whether it still fits."],
    ],
    pro: {
      challenges: [
        ["Unsure what is covered", "Policies that are hard to understand."],
        ["Life has changed", "Cover that has not kept up."],
        ["Too many policies", "Cover spread across several companies."],
      ],
      process: [
        ["Talk", "Understand what needs protecting."],
        ["Compare", "Look at options side by side."],
        ["Choose", "Pick the cover that fits."],
        ["Check in", "Revisit it when things change."],
      ],
      industries: [
        ["Households", "Families and homeowners."],
        ["Small businesses", "Local companies and their owners."],
        ["Drivers", "Personal and commercial vehicles."],
      ],
    },
  },
  {
    subtype: "real_estate",
    match: /^real_estate$/,
    noun: "Real estate",
    described: "real estate business",
    offerings: [
      ["Buying", "Help finding and buying the right home."],
      ["Selling", "Preparing, pricing and marketing a home for sale."],
      ["Market guidance", "What is happening in local neighbourhoods."],
      ["Relocation help", "Support for people moving to the area."],
    ],
    pro: {
      challenges: [
        ["Where to start", "Buying or selling feels like a lot of steps."],
        ["Knowing the market", "Hard to judge what a home is worth."],
        ["Timing", "Coordinating a sale and a purchase."],
      ],
      process: [
        ["Meet", "Talk through goals and timing."],
        ["Plan", "Agree a plan for buying or selling."],
        ["Act", "Showings, offers and negotiation."],
        ["Close", "Through to the closing table."],
      ],
      industries: [
        ["First-time buyers", "People buying their first home."],
        ["Sellers", "Homeowners ready to move."],
        ["Relocating families", "People new to the area."],
      ],
    },
  },
  {
    subtype: "digital_services",
    match: /^digital_services$/,
    noun: "Digital services",
    described: "digital services agency",
    offerings: [
      ["Websites", "Websites designed around what visitors need to do."],
      ["Search and local listings", "Being found in search and on maps."],
      ["Social media", "Planning and producing social content."],
      ["Campaigns", "Marketing campaigns with clear goals."],
    ],
    pro: {
      challenges: [
        ["Not being found", "Customers search and do not see the business."],
        ["Scattered marketing", "Efforts that do not add up to results."],
        ["No time", "Marketing always comes after the day-to-day work."],
      ],
      process: [
        ["Discover", "Learn the business and its customers."],
        ["Plan", "Agree goals and the work to reach them."],
        ["Create", "Build and launch the work."],
        ["Measure", "Track what works and adjust."],
      ],
      industries: [
        ["Local businesses", "Owner-led local companies."],
        ["Professional firms", "Advisors and service firms."],
        ["Community organizations", "Groups and nonprofits."],
      ],
    },
  },
  {
    subtype: "general_consulting",
    match: /./,
    noun: "Consulting",
    described: "consulting firm",
    offerings: [
      ["Assessments", "A structured look at where things stand."],
      ["Strategy", "A practical plan for what to change and why."],
      ["Implementation", "Help putting the plan into practice."],
      ["Ongoing support", "Regular check-ins as the work continues."],
    ],
    pro: {
      challenges: [
        ["Unclear priorities", "Too many things that all seem urgent."],
        ["Stalled projects", "Good plans that never quite get done."],
        ["Growing pains", "Processes that worked when the business was smaller."],
      ],
      process: [
        ["Assess", "Understand the situation."],
        ["Plan", "Agree what to do first."],
        ["Act", "Do the work together."],
        ["Support", "Keep it working."],
      ],
      industries: [
        ["Small businesses", "Owner-led companies."],
        ["Growing firms", "Businesses adding people and locations."],
        ["Nonprofits", "Mission-driven organizations."],
      ],
    },
  },
];

/** The pack for a professional firm's subtype. */
export function proPackFor(subtype: string | undefined): Pack {
  return (
    PRO_PACKS.find((p) => p.subtype === subtype) ?? PRO_PACKS[PRO_PACKS.length - 1]!
  );
}

// --- Vertical checklist steps (exactly the Phase 2 wording) -----------------

const bookingStep = (f: SiteFacts, has: (k: string) => boolean): ChecklistItem => ({
  id: "booking",
  area: "Booking",
  task: f.vendors.length
    ? `Connect the Book button to the booking tool they already use (${f.vendors.join(", ")}).`
    : "Choose an online booking tool with the owner (for example Square Appointments, Vagaro or Booksy) and connect the Book button.",
  why: has("site.booking")
    ? "No online booking was found on their current site."
    : "Booking is the main action for a salon or barber.",
  owner: "Business owner",
});

const restaurantSteps = (
  f: SiteFacts,
  has: (k: string) => boolean,
): ChecklistItem[] => [
  {
    id: "menu",
    area: "Content",
    task: "Get the real menu (with prices, if the owner wants them shown) and replace the sample menu section.",
    why: has("site.menu")
      ? "No menu was found on their current site."
      : "Customers look for the menu first.",
    owner: "Business owner",
  },
  {
    id: "ordering",
    area: "Ordering",
    task: f.vendors.length
      ? `Link the ordering tool they already use (${f.vendors.join(", ")}).`
      : "Decide with the owner whether to offer online ordering (for example Toast or Square Online) and link it.",
    why: has("site.ordering")
      ? "No online ordering was found on their current site."
      : "Ordering ahead is a common reason to visit a restaurant site.",
    owner: "Business owner",
  },
];

const professionalSteps = (
  f: SiteFacts,
  has: (k: string) => boolean,
): ChecklistItem[] => [
  {
    id: "consultation",
    area: "Consultations",
    task: f.vendors.length
      ? `Connect the consultation button to the scheduling tool already in use (${f.vendors.join(", ")}).`
      : "Decide how a consultation is requested (a scheduling link, a call, or the contact form) and connect the main button to it.",
    why: has("site.consultation")
      ? "No consultation or assessment call to action was found on the current site."
      : "Starting a conversation is the main action on a professional-services site.",
    owner: "Business owner",
  },
  {
    id: "proof",
    area: "Verification",
    task: "Replace the case-study placeholder with real examples only after the client has agreed to be named and every figure is checked.",
    why: "Case studies, statistics and testimonials must be true and permitted before they appear.",
    owner: "Business owner",
  },
];

const LOCAL_SECTIONS: SiteSection[] = [
  "banner",
  "header",
  "hero",
  "offerings",
  "about",
  "visit",
  "video",
  "contact",
  "footer",
];

export const SITE_VERTICAL_REGISTRY: Record<SiteVertical, SiteVerticalDef> = {
  contractor: {
    key: "contractor",
    plural: "contractors",
    label: "Contractor / home services",
    schemaType: () => "HomeAndConstructionBusiness",
    accent: { accent: "#2f5e8c", dark: "#244a70", soft: "#e6eef6" }, // DDH blue
    primaryCta: "Request an estimate",
    action: { verb: "to ask about a job", cta: "Tell us about your project" },
    offeringsHeading: "What we do",
    packs: LOCAL_PACKS.contractor,
    sections: LOCAL_SECTIONS,
    modules: ["calls_texts", "directions", "estimates", "lead_capture"],
    requiredFacts: ["name", "contact"],
    requiredProfileFields: ["phone"],
    checklist: () => [],
    renderer: "local",
    validation: { minOfferings: 3, maxOfferings: 6, itemNameMax: 40 },
  },
  salon_barber: {
    key: "salon_barber",
    plural: "salons/barbers",
    label: "Salon / barber",
    schemaType: () => "HairSalon",
    accent: { accent: "#9a4040", dark: "#7a3030", soft: "#f6e8e8" },
    primaryCta: "Book an appointment",
    action: {
      verb: "to book your next visit",
      cta: "Ready for your next appointment?",
    },
    offeringsHeading: "What we do",
    packs: LOCAL_PACKS.salon_barber,
    sections: LOCAL_SECTIONS,
    modules: ["calls_texts", "directions", "booking"],
    requiredFacts: ["name", "contact"],
    requiredProfileFields: ["phone"],
    checklist: (f, has) => [bookingStep(f, has)],
    renderer: "local",
    validation: { minOfferings: 3, maxOfferings: 6, itemNameMax: 40 },
  },
  restaurant_bar: {
    key: "restaurant_bar",
    plural: "restaurants/bars",
    label: "Restaurant / bar",
    schemaType: () => "Restaurant",
    accent: { accent: "#d97828", dark: "#b0601d", soft: "#fbeee2" },
    primaryCta: "Plan a visit",
    action: {
      verb: "to order ahead or plan a visit",
      cta: "Hungry? Call ahead or stop in",
    },
    offeringsHeading: "On the menu",
    packs: LOCAL_PACKS.restaurant_bar,
    sections: LOCAL_SECTIONS,
    modules: ["calls_texts", "directions", "menu", "ordering"],
    requiredFacts: ["name", "contact"],
    requiredProfileFields: ["phone"],
    checklist: restaurantSteps,
    renderer: "local",
    validation: { minOfferings: 3, maxOfferings: 6, itemNameMax: 40 },
  },
  professional_services: {
    key: "professional_services",
    plural: "professional-services firms",
    label: "Professional services / consulting",
    schemaType: (f) =>
      f.subtype === "accounting"
        ? "AccountingService"
        : f.subtype === "insurance"
          ? "InsuranceAgency"
          : f.subtype === "real_estate"
            ? "RealEstateAgent"
            : "ProfessionalService",
    accent: { accent: "#2d6a6a", dark: "#225252", soft: "#e3f0ef" },
    primaryCta: "Request a consultation",
    action: { verb: "to talk through what you need", cta: "Start with a conversation" },
    offeringsHeading: "Services",
    packs: PRO_PACKS,
    sections: [
      "banner",
      "header",
      "hero",
      "challenges",
      "offerings",
      "process",
      "industries",
      "experience",
      "proof",
      "tools",
      "about",
      "cta",
      "contact",
      "footer",
    ],
    modules: ["consultation", "calls_texts", "lead_capture"],
    requiredFacts: ["name", "contact"],
    requiredProfileFields: [
      "brandName",
      "description",
      "phone",
      "email",
      "serviceArea",
      "primaryCta",
      "privacyUrl",
    ],
    checklist: professionalSteps,
    renderer: "professional",
    validation: { minOfferings: 3, maxOfferings: 10, itemNameMax: 60 },
  },
};

export function verticalDef(v: SiteVertical): SiteVerticalDef {
  return SITE_VERTICAL_REGISTRY[v];
}

export const SITE_VERTICALS = Object.keys(SITE_VERTICAL_REGISTRY) as SiteVertical[];

export function isSiteVertical(v: string): v is SiteVertical {
  return (SITE_VERTICALS as string[]).includes(v);
}

/** "contractors, salons/barbers, restaurants/bars and professional-services firms". */
export function supportedVerticalsText(): string {
  const names = Object.values(SITE_VERTICAL_REGISTRY).map((d) => d.plural);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "");
}
