import { ContentPage, Section, Grid, Card } from "@/components/ui";
import { PAGES, FOCUS_MARKETS } from "@/lib/content";
import { industrySolutions } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export default function IndustriesPage() {
  const groups = industrySolutions();
  const lineFor = (m: string) => FOCUS_MARKETS.find((f) => f.name === m)?.line ?? "";
  return (
    <ContentPage copy={PAGES["industries"]!}>
      {groups.map((g) => (
        <Section key={g.market} heading={g.market}>
          <p style={{ fontSize: 13.5, color: "#5b6672", marginTop: -4 }}>
            {lineFor(g.market)}
          </p>
          {g.solutions.length > 0 ? (
            <Grid min={260}>
              {g.solutions.map((s) => (
                <Card key={s.key} title={s.name}>
                  {s.description}
                </Card>
              ))}
            </Grid>
          ) : (
            <p style={{ fontSize: 13, color: "#8a94a0" }}>
              Capabilities available — talk to an advisor.
            </p>
          )}
        </Section>
      ))}
    </ContentPage>
  );
}
