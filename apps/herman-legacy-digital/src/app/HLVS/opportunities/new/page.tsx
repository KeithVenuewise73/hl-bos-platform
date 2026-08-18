import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, colors } from "@/hlvs/components/ui";
import { NewOpportunityForm } from "@/hlvs/components/Forms";

export default function NewOpportunity() {
  return (
    <StudioShell view="new_opportunity">
      <h1 style={{ fontSize: 20 }}>New Opportunity</h1>
      <p style={{ color: colors.dim, fontSize: 13 }}>
        Manual intake. Nothing here is auto-discovered; you are recording an executive
        hypothesis.
      </p>
      <Card>
        <NewOpportunityForm />
      </Card>
    </StudioShell>
  );
}
