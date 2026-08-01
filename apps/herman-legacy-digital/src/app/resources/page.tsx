import { ContentPage, Section, Grid, Card, Badge } from "@/components/ui";
import { PAGES } from "@/lib/content";
import { referenceBusinesses } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export default function ResourcesPage() {
  const refs = referenceBusinesses();
  return (
    <ContentPage copy={PAGES["resources"]!}>
      <Section heading="Reference implementations">
        <Grid min={280}>
          {refs.map((r) => (
            <Card key={r.org} title={r.org}>
              <div style={{ marginBottom: 6 }}>
                <Badge>{r.label}</Badge>
              </div>
              <div>{r.status}</div>
              <div style={{ marginTop: 6 }}>Focus: {r.solutions.join(", ")}</div>
            </Card>
          ))}
        </Grid>
        <p style={{ fontSize: 12, color: "#5b6672", marginTop: 12 }}>
          We publish measured results — not projections. These reference implementations
          are in progress; baselines are pending live assessment.
        </p>
      </Section>
    </ContentPage>
  );
}
