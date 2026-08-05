import { Page, Hero, Section, Grid, Card, CTA } from "@/components/ui";
import { PAGES, METHODOLOGY, FOCUS_MARKETS, PRIMARY_CTA } from "@/lib/content";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const c = PAGES["home"]!;
  return (
    <Page>
      <Hero title={c.title} lede={c.lede} />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <CTA href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</CTA>
        <CTA href="/visibility-assessment">Request a Visibility Assessment</CTA>
        <CTA href="/transformation">How we transform businesses</CTA>
      </div>

      <Section heading="What you get">
        <Grid>
          {c.sections.map((s) => (
            <Card key={s.heading} title={s.heading}>
              {s.body}
            </Card>
          ))}
        </Grid>
      </Section>

      <Section heading="Our methodology">
        <Grid min={200}>
          {METHODOLOGY.map((m, i) => (
            <Card key={m.step} title={`${i + 1}. ${m.step}`}>
              {m.detail}
            </Card>
          ))}
        </Grid>
      </Section>

      <Section heading="Where we focus">
        <Grid min={260}>
          {FOCUS_MARKETS.map((m) => (
            <Card key={m.name} title={m.name}>
              {m.line}
            </Card>
          ))}
        </Grid>
      </Section>
    </Page>
  );
}
