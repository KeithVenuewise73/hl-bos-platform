import { Page, Hero, Section } from "@/components/ui";
import { ScanExperience } from "@/components/transformation-report/ScanExperience";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Free AI Business Scan — Herman Legacy Digital",
  description:
    "Enter your website and get an evidence-based Business Transformation Report in under a minute — every measurable problem, its impact, and how Herman Legacy fixes it.",
};

// The customer-acquisition front door: a real, self-service analysis of the
// visitor's own website that produces an interactive Transformation Report and
// hands off into the recurring-revenue platform via the Blueprint.
export default function ScanPage() {
  return (
    <Page>
      <Hero
        title="See what's costing your business customers — in 60 seconds"
        lede="Enter your website. Our AI reads your live site and returns an evidence-based Business Transformation Report: every measurable problem, what it's costing you, and exactly how Herman Legacy fixes it."
      />
      <Section heading="Start your free AI Business Scan">
        <ScanExperience />
      </Section>
    </Page>
  );
}
