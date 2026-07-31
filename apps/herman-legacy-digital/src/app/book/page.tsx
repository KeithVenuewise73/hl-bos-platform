import { Page, Hero, Section } from "@/components/ui";
import { PAGES } from "@/lib/content";
import { IntakeForm } from "@/components/IntakeForm";

export const dynamic = "force-dynamic";

export default function BookPage() {
  const c = PAGES["book"]!;
  return (
    <Page>
      <Hero title={c.title} lede={c.lede} />
      <Section heading="Tell us about your business">
        <IntakeForm kind="consultation" />
      </Section>
    </Page>
  );
}
