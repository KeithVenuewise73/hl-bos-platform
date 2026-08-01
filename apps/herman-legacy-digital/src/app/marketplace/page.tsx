import { ContentPage, Section, Grid, Card, CTA } from "@/components/ui";
import { PAGES } from "@/lib/content";
import { solutionsByCategory } from "@/lib/public-data";

export const dynamic = "force-dynamic";

// Public introduction ONLY. No internal metrics (assembly %, maturity, net-new)
// cross the public boundary. The advisor recommends the right path.
export default function MarketplacePage() {
  const groups = solutionsByCategory();
  return (
    <ContentPage copy={PAGES["marketplace"]!}>
      <Section>
        <p style={{ fontSize: 13.5, color: "#5b6672" }}>
          This is a public introduction. Your personalized recommendations and
          transformation roadmap live in your client portal — your advisor sets the
          plan, always.
        </p>
        <div style={{ marginTop: 10 }}>
          <CTA href="/book">Talk to an advisor</CTA>
        </div>
      </Section>
      {groups.map((g) => (
        <Section key={g.category} heading={g.category}>
          {g.solutions.length > 0 ? (
            <Grid min={240}>
              {g.solutions.map((s) => (
                <Card key={s.key} title={s.name}>
                  {s.description}
                </Card>
              ))}
            </Grid>
          ) : (
            <p style={{ fontSize: 13, color: "#8a94a0" }}>
              Capabilities available on request.
            </p>
          )}
        </Section>
      ))}
    </ContentPage>
  );
}
