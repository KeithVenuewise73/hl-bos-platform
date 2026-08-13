import { Page, Hero, Section } from "@/components/ui";
import { BlueprintExperience } from "@/components/transformation-report/BlueprintExperience";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Transformation Blueprint — Herman Legacy Digital",
  description:
    "Your prioritized 30-day, 90-day, and 12-month plan, built from your free AI Business Scan — and the Herman Legacy solutions that deliver it.",
};

// Stage 3 of the customer journey: the free analysis becomes an actionable,
// prioritized plan and the transition into the recurring-revenue platform.
export default function TransformationBlueprintPage() {
  return (
    <Page>
      <Hero
        title="Your Transformation Blueprint"
        lede="From free scan to a staged plan: what to do in the first 30 days, the next 90, and across the year — and the Herman Legacy solutions that deliver each step."
      />
      <Section heading="Your prioritized plan">
        <BlueprintExperience />
      </Section>
    </Page>
  );
}
