import { ContentPage, Section, Grid, Card } from "@/components/ui";
import { PAGES } from "@/lib/content";
import { solutionsByCategory } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export default function SolutionsPage() {
  const groups = solutionsByCategory().filter((g) => g.solutions.length > 0);
  return (
    <ContentPage copy={PAGES["solutions"]!}>
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
