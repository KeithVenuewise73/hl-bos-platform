import { ContentPage, Section, Grid, Card, CTA } from "@/components/ui";
import {
  PAGES,
  SERVICES,
  PRICING_NOTE,
  NOT_YET_AVAILABLE,
  PORTFOLIO_NOTE,
} from "@/lib/content";
import { solutionsByCategory } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export default function SolutionsPage() {
  const groups = solutionsByCategory().filter((g) => g.solutions.length > 0);
  return (
    <ContentPage copy={PAGES["solutions"]!}>
      <Section heading="What we offer today">
        <Grid min={260}>
          {SERVICES.map((s) => (
            <Card key={s.name} title={s.name}>
              {s.summary}
            </Card>
          ))}
        </Grid>
        <p style={{ fontSize: 13.5, color: "#5b6672", marginTop: 14 }}>
          {PRICING_NOTE} {NOT_YET_AVAILABLE}
        </p>
        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <CTA href="/book">Book a free consultation</CTA>
          <CTA href="/visibility-assessment">Request a Visibility Assessment</CTA>
        </div>
      </Section>
      <Section heading="Herman Legacy products">
        <p style={{ fontSize: 13.5, color: "#5b6672", marginTop: -4 }}>
          {PORTFOLIO_NOTE}
        </p>
      </Section>
      {groups.map((g) => (
        <Section key={g.category} heading={g.category}>
          <Grid min={260}>
            {g.solutions.map((s) => (
              <Card key={s.key} title={s.name}>
                {s.description}
                <div style={{ marginTop: 6, fontSize: 12, color: "#8a94a0" }}>
                  For: {s.targetMarket}
                </div>
              </Card>
            ))}
          </Grid>
        </Section>
      ))}
    </ContentPage>
  );
}
