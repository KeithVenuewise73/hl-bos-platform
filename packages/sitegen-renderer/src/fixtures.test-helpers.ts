/* eslint-disable @typescript-eslint/no-explicit-any -- tests deliberately build specs that FAIL validation, to prove the renderer is safe anyway */
import { defaultSpec, type Intake, type SiteSpec } from "@hl-bos/sitegen-spec";
import type { RenderContext } from "./types.ts";

export const LOGO_ID = "123e4567-e89b-12d3-a456-426614174001";
export const GAL_ID = "123e4567-e89b-12d3-a456-426614174002";

export const intake: Intake = {
  businessName: "Main Street Barbers",
  phone: "+17165550100",
  address: { street: "12 Main St", city: "Buffalo", region: "NY", postalCode: "14201" },
  hours: [
    { day: "sat", open: "08:00", close: "15:00" },
    { day: "mon", closed: true },
    { day: "tue", open: "09:00", close: "18:00" },
  ],
  services: [
    {
      name: "Haircut",
      priceCents: 3000,
      durationMinutes: 30,
      description: "Cut and style.",
    },
    { name: "Beard trim", priceCents: 1550 },
    { name: "Hot towel shave" },
  ],
  bookingUrl: "https://book.example.com/main-street",
  about:
    "A neighbourhood shop on Main Street.\nWalk-ins welcome when there is a chair free.",
};

export const ctx: RenderContext = {
  origin: "https://main-street.example.com",
  assets: {
    logoUrl: "https://cdn.example.com/logo.png",
    heroUrl: "https://cdn.example.com/hero.jpg",
    gallery: { [GAL_ID]: "https://cdn.example.com/g1.jpg" },
  },
  lastModified: "2026-11-20",
};

/** A typical spec: every section type, three services, hours, address, booking link. */
export function typicalSpec(): SiteSpec {
  const s = defaultSpec("barber", intake);
  const page = s.pages[0]!;
  page.sections.splice(4, 0, {
    type: "gallery",
    items: [{ assetId: GAL_ID, alt: "The shop floor" }],
  });
  page.sections.push({
    type: "faq",
    items: [{ question: "Do I need an appointment?", answer: "Walk-ins are fine." }],
  });
  return s;
}

export const bareSpec = (): SiteSpec =>
  defaultSpec("barber", { businessName: "Bare Cuts", phone: "+17165550100" });

/** Deep-clone helper so a test can hand the renderer a spec that FAILS validation (the renderer must still be safe). */
export const unchecked = (
  s: SiteSpec,
  patch: (x: Record<string, any>) => void,
): SiteSpec => {
  const c = structuredClone(s) as unknown as Record<string, any>;
  patch(c);
  return c as unknown as SiteSpec;
};
