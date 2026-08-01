import { ContentPage, Section, Grid, Card } from "@/components/ui";
import { PAGES, METHODOLOGY } from "@/lib/content";

export const dynamic = "force-dynamic";

export default function TransformationPage() {
  return (
    <ContentPage copy={PAGES["transformation"]!}>
      <Section heading="The eight steps">
        <Grid min={220}>
          {METHODOLOGY.map((m, i) => (
            <Card key={m.step} title={`${i + 1}. ${m.step}`}>
              {m.detail}
            </Card>
          ))}
        </Grid>
      </Section>
    </ContentPage>
  );
}
