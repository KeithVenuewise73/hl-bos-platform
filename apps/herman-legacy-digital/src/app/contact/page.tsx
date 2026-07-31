import { ContentPage, Section, Card, CTA } from "@/components/ui";
import { PAGES } from "@/lib/content";

export const dynamic = "force-dynamic";

export default function ContactPage() {
  return (
    <ContentPage copy={PAGES["contact"]!}>
      <Section>
        <Card title="Start a conversation">
          The fastest way to begin is to request a Visibility Assessment or a
          consultation — a Herman Legacy advisor will follow up.
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <CTA href="/visibility-assessment">Request an Assessment</CTA>
            <CTA href="/book">Book a Consultation</CTA>
          </div>
        </Card>
      </Section>
    </ContentPage>
  );
}
