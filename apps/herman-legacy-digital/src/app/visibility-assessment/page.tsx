import { Page, Hero, Section } from "@/components/ui";
import { PAGES } from "@/lib/content";
import { IntakeForm } from "@/components/IntakeForm";

export const dynamic = "force-dynamic";

export default function VisibilityAssessmentPage() {
  const c = PAGES["visibility"]!;
  return (
    <Page>
      <Hero title={c.title} lede={c.lede} />
      {c.sections.map((s) => (
        <p key={s.heading} style={{ fontSize: 14, color: "#3a434e", maxWidth: 680 }}>
          <strong>{s.heading}. </strong>
          {s.body}
        </p>
      ))}
      <Section heading="Request your assessment">
        <IntakeForm kind="visibility_assessment" />
      </Section>
    </Page>
  );
}
