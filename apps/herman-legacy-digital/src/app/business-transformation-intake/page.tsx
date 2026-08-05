import { Page, Section, Card, Grid, colors } from "@/components/ui";
import { BTDI } from "@/lib/content";
import { BusinessTransformationIntakeForm } from "@/components/BusinessTransformationIntakeForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Business Transformation Intake — Herman Legacy Digital",
  description:
    "Tell us about your business so Herman Legacy Digital can begin building a practical transformation plan for clarity, efficiency, and more freedom.",
};

export default function BusinessTransformationIntakePage() {
  return (
    <Page>
      {/* Hero */}
      <section style={{ padding: "24px 0 8px" }}>
        <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: 0, maxWidth: 780 }}>
          {BTDI.hero.headline}
        </h1>
        <p
          style={{
            fontSize: 17,
            color: colors.MUTED,
            marginTop: 14,
            maxWidth: 720,
            lineHeight: 1.55,
          }}
        >
          {BTDI.hero.body}
        </p>
        <p style={{ fontSize: 14, color: colors.INK, marginTop: 16, fontWeight: 600 }}>
          {BTDI.hero.cta} ↓
        </p>
      </section>

      {/* Expectations */}
      <Section heading="What to expect">
        <Grid min={260}>
          {BTDI.expectations.map((e) => (
            <Card key={e}>{e}</Card>
          ))}
        </Grid>
      </Section>

      {/* Form */}
      <Section heading="Begin your assessment">
        <BusinessTransformationIntakeForm />
      </Section>
    </Page>
  );
}
