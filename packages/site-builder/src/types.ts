// Shapes for the Instant Site Builder.
//
// The rule that shapes everything here: a demo site says only what the lead's
// evidence supports. Facts (name, phone, address, Google rating) come from the
// Presence Scanner record and carry their source. Everything we cannot know --
// the actual services, prices, story -- is SAMPLE content, marked as such on
// the page, for the owner to replace. Nothing is published from here.

export type SiteVertical =
  "contractor" | "salon_barber" | "restaurant_bar" | "professional_services";

/**
 * prospect_demo   a demo for a business HLG has not spoken to (Phase 2).
 * internal_draft  HLG's own business, built from a verified Business Profile.
 */
export type DraftMode = "prospect_demo" | "internal_draft";

/** What we actually know about the business, each item traceable to the lead. */
export interface SiteFacts {
  prospectId: string;
  businessName: string;
  vertical: SiteVertical;
  /** Google's category label (e.g. "Roofing contractor"), when known. */
  category: string | undefined;
  city: string | undefined;
  address: string | undefined;
  /** Display form, e.g. "(716) 555-0101". */
  phone: string | undefined;
  /** E.164-ish digits for tel:/sms: links, e.g. "+17165550101". */
  phoneLink: string | undefined;
  email: string | undefined;
  /** Their current website, if they have a real one (not a social page). */
  existingWebsite: string | undefined;
  /** Google Maps link for directions, from Places; otherwise a search link. */
  directionsUrl: string | undefined;
  /** Google rating, shown only with attribution and only while held. */
  rating:
    | { value: number; count: number; source: "Google Maps"; observedAt: string }
    | undefined;
  /** Finding keys the lead is missing (site.booking, places.hours, ...). */
  gaps: string[];
  /** Conversion tools already on their current site (e.g. "Vagaro"). */
  vendors: string[];
  websiteStatus: string;
  /** Professional services only: the kind of firm (verticals in presence-scanner). */
  subtype?: string;
}

export interface Offering {
  name: string;
  description: string;
  /** True until a reviewer replaces it with the business's own. */
  sample: boolean;
  /**
   * True only for content copied from a VERIFIED Business Profile field.
   * Verified items may state approved experience; they still may not carry a
   * price, a link, markup or a testimonial.
   */
  verified?: boolean;
}

/** A product or tool shown on a page, with its real status. */
export interface ToolItem {
  name: string;
  description: string;
  /** live = customers can use it; in_development = built, not offered; planned = no product yet. */
  status: "live" | "in_development" | "planned" | "in_use";
}

/** The extra sections of the professional-services template. */
export interface ProfessionalCopy {
  primaryCta: string;
  secondaryCta: string | undefined;
  challengesHeading: string;
  challenges: Offering[];
  processHeading: string;
  process: Offering[];
  industriesHeading: string;
  industries: Offering[];
  experienceHeading: string;
  /** Empty until a verified profile supplies it: never sample claims. */
  experience: Offering[];
  proofHeading: string;
  /** Verified case studies only. Empty = an "information required" notice. */
  proof: Offering[];
  toolsHeading: string;
  tools: ToolItem[];
}

/** The words on the page. Every field passes validateCopy before use. */
export interface SiteCopy {
  seoTitle: string;
  metaDescription: string;
  heroEyebrow: string;
  heroHeadline: string;
  heroSubhead: string;
  aboutHeading: string;
  aboutBody: string;
  /** About text is sample unless a reviewer wrote it. */
  aboutSample: boolean;
  offeringsHeading: string;
  offeringsIntro: string;
  offerings: Offering[];
  ctaHeading: string;
  ctaBody: string;
  /** Professional services only. */
  pro?: ProfessionalCopy;
  /**
   * Core fields whose text came from a VERIFIED Business Profile field (internal
   * drafts only). They pass the relaxed verified rules; a reviewer edit drops
   * the field from this list, so edited text faces the full guard again.
   */
  verifiedFields?: VerifiableField[];
}

export type VerifiableField =
  "heroEyebrow" | "heroHeadline" | "heroSubhead" | "aboutBody" | "metaDescription";

export interface SiteOptions {
  /** Show the Google rating strip (only possible when a rating is held). */
  showRating: boolean;
  /** Show the optional promo-video placeholder block. */
  showVideoBlock: boolean;
}

export interface ChecklistItem {
  id: string;
  area:
    | "Content"
    | "Domain"
    | "Hosting"
    | "Google profile"
    | "Calls and texts"
    | "Booking"
    | "Ordering"
    | "Leads and CRM"
    | "Reviews"
    | "Measurement"
    | "Consultations"
    | "Verification"
    | "Legal"
    | "Publishing";
  task: string;
  /** Why it is on the list: the finding or fact behind it. */
  why: string;
  owner: "HLG" | "Business owner" | "CEO decision";
}

export type DraftStatus = "draft" | "approved";

export interface SiteDraft {
  id: string;
  prospectId: string;
  /** Increments on every rebuild for the same lead. */
  version: number;
  vertical: SiteVertical;
  facts: SiteFacts;
  copy: SiteCopy;
  /** "template" or "claude:<model>". */
  copySource: string;
  /** Why a Claude draft was not used, when it was tried. */
  copyNotes: string[];
  options: SiteOptions;
  checklist: ChecklistItem[];
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
  /** How long the build took, end to end. */
  buildMs: number;
  approved: { by: string; at: string } | undefined;
  audit: { at: string; by: string; action: string; detail: string }[];
  /** Absent on drafts saved before Phase 3A: those are prospect demos. */
  mode?: DraftMode;
  /** internal_draft: the Business Profile it was built from. */
  profileId?: string;
  /** internal_draft: what the profile is still missing, in plain English. */
  infoRequired?: string[];
  /** internal_draft: the brand accent from the profile. */
  brand?: { accent: string; dark: string; soft: string; mark: string | undefined };
  /** internal_draft: verified footer links (privacy, terms). */
  legalLinks?: { label: string; url: string }[];
}
