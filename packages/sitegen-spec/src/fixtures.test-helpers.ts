import type { Intake } from "./default-spec.ts";

/** Mirrors tests.sg_spec in supabase/tests/60_sitegen.sql (same shape, same defaults). */
export function sgSpec(
  color = "#112233",
  phone = "+17165550100",
  pages = 1,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    specVersion: 1,
    vertical: "barber",
    theme: {
      brandColor: color,
      accentColor: "#c8a24a",
      fontHeading: "serif_classic",
      fontBody: "sans_clean",
    },
    profile: {
      businessName: "Test Barbers",
      phone,
      services: [{ name: "Haircut", priceCents: 3000 }],
      hours: [],
    },
    hero: { headline: "Fresh cuts", subheadline: "", choice: { kind: "default" } },
    pages: Array.from({ length: pages }, (_, i) => ({
      slug: `p${i + 1}`,
      title: `Page ${i + 1}`,
      sections: [],
    })),
    seo: { title: "Test Barbers", description: "A barber shop" },
    ...extra,
  };
}

export const intake: Intake = {
  businessName: "Main Street Barbers",
  phone: "+17165550100",
  address: { street: "12 Main St", city: "Buffalo", region: "NY", postalCode: "14201" },
  hours: [
    { day: "mon", closed: true },
    { day: "tue", open: "09:00", close: "18:00" },
    { day: "sat", open: "08:00", close: "15:00" },
  ],
  services: [
    { name: "Haircut", priceCents: 3000, durationMinutes: 30 },
    { name: "Beard trim" },
  ],
  bookingUrl: "https://book.example.com/main-street",
};
