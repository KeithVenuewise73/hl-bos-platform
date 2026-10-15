// The launch checklist: what has to happen before a demo becomes the
// business's real website. Derived from the lead's own findings, so every item
// says why it is there. Spending, DNS and publishing are marked as decisions,
// never steps the tool takes.

import type { ChecklistItem, SiteFacts } from "./types.ts";

export function launchChecklist(f: SiteFacts, sampleCount: number): ChecklistItem[] {
  const has = (k: string) => f.gaps.includes(k);
  const items: ChecklistItem[] = [];
  const add = (i: ChecklistItem) => items.push(i);

  add({
    id: "content-approval",
    area: "Content",
    task: `Walk ${f.businessName}'s owner through the demo; replace every Sample item with their real services, story and photos, and get their written approval of the final wording.`,
    why: sampleCount
      ? `${sampleCount} item(s) on the demo are marked Sample.`
      : "Nothing goes live without the owner's approval.",
    owner: "Business owner",
  });
  add(
    f.existingWebsite
      ? {
          id: "domain",
          area: "Domain",
          task: `Keep their existing domain (${f.existingWebsite.replace(/^https?:\/\//, "")}); with the owner's login, point it at the new site.`,
          why: "They already have a website address; changing it would lose what people know.",
          owner: "Business owner",
        }
      : {
          id: "domain",
          area: "Domain",
          task: "Choose a domain with the owner and register it in the business's own name and account. HLG never registers a prospect's name.",
          why:
            f.websiteStatus === "social_only"
              ? "They use a social page as their website."
              : "No website of their own was found.",
          owner: "Business owner",
        },
  );
  add({
    id: "hosting",
    area: "Hosting",
    task: "Decide where the site is hosted and on what terms (HLG-managed hosting or the owner's own).",
    why: "Hosting is a paid service and an ongoing commitment.",
    owner: "CEO decision",
  });
  if (has("places.website") || has("website.exists"))
    add({
      id: "gbp-website",
      area: "Google profile",
      task: "Add the new website to the Google Business Profile (owner signs in or grants HLG manager access).",
      why: "The Google listing shows no website.",
      owner: "Business owner",
    });
  if (has("places.hours"))
    add({
      id: "gbp-hours",
      area: "Google profile",
      task: "Add opening hours to the Google Business Profile.",
      why: "The Google listing shows no hours.",
      owner: "Business owner",
    });
  if (has("places.photos"))
    add({
      id: "gbp-photos",
      area: "Google profile",
      task: "Add the owner's own photos to the Google Business Profile and the site.",
      why: "The Google listing has no photos.",
      owner: "Business owner",
    });
  add({
    id: "calls-texts",
    area: "Calls and texts",
    task: f.phoneLink
      ? `Confirm ${f.phone} is the right number for calls and can receive text messages before the Call and Text buttons go live.`
      : "Get the business phone number; the Call and Text buttons need it.",
    why: has("site.call")
      ? "Their current site has no click-to-call."
      : "Calls and texts are the main way local customers get in touch.",
    owner: "Business owner",
  });
  if (f.vertical === "salon_barber")
    add({
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
  if (f.vertical === "restaurant_bar") {
    add({
      id: "menu",
      area: "Content",
      task: "Get the real menu (with prices, if the owner wants them shown) and replace the sample menu section.",
      why: has("site.menu")
        ? "No menu was found on their current site."
        : "Customers look for the menu first.",
      owner: "Business owner",
    });
    add({
      id: "ordering",
      area: "Ordering",
      task: f.vendors.length
        ? `Link the ordering tool they already use (${f.vendors.join(", ")}).`
        : "Decide with the owner whether to offer online ordering (for example Toast or Square Online) and link it.",
      why: has("site.ordering")
        ? "No online ordering was found on their current site."
        : "Ordering ahead is a common reason to visit a restaurant site.",
      owner: "Business owner",
    });
  }
  add({
    id: "form-crm",
    area: "Leads and CRM",
    task: "Decide where contact-form messages go (the owner's email, or a CRM) before the form is switched on.",
    why: has("site.form")
      ? "Their current site has no contact or quote form."
      : "The demo form is switched off until this is decided.",
    owner: "CEO decision",
  });
  add({
    id: "reviews",
    area: "Reviews",
    task: "If the owner wants more reviews, set up an honest review-request process: ask every customer, never only the happy ones, and never write or buy reviews.",
    why: f.rating
      ? `Google shows ${f.rating.value.toFixed(1)} from ${f.rating.count} review(s) (Google Maps).`
      : "No Google rating was available.",
    owner: "HLG",
  });
  add({
    id: "analytics",
    area: "Measurement",
    task: "Add privacy-respecting visit and call tracking so the owner can see what the site does for them.",
    why: has("site.analytics")
      ? "No analytics were found on their current site."
      : "Results should be measured, not assumed.",
    owner: "HLG",
  });
  return items;
}
