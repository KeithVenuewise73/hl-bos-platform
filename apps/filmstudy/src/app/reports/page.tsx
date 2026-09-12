import { PageHead, PhasePage } from "@/components/ui";

export default function ReportsPage() {
  return (
    <>
      <PageHead title="Reports" />
      <PhasePage
        phase={2}
        title="Game review, opponent scout and player development reports"
        what={
          "One-click game review and scouting reports, and a per-player development report " +
          "with strengths, improvement areas, the coach's own notes and the film examples " +
          "behind each point — exportable to PDF."
        }
        blockedBy={[
          "A report is a rendering of tendencies and grades. Both exist in the database now; the aggregation layer they render from lands with Phase 2.",
          "A development plan is generated from confirmed coaching observations and must go to the coach for approval before the athlete sees it. That approval gate is built before the generator, not after.",
          "PDF export needs a rendering service. Nothing in this app can produce one yet, so no export button is shown.",
        ]}
      />
    </>
  );
}
