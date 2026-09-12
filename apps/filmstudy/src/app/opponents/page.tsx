import { PageHead, PhasePage } from "@/components/ui";

export default function OpponentScoutPage() {
  return (
    <>
      <PageHead title="Opponent Scout" />
      <PhasePage
        phase={2}
        title="Opponent tendencies, built from confirmed film"
        what={
          "Formation and personnel frequency, run/pass split by down and distance, front and " +
          "coverage frequency, blitz rate on third and long — each figure clickable " +
          "straight through to the plays behind it."
        }
        blockedBy={[
          "Opponent film has to be uploaded and charted. A tendency is a claim about what a team does, and it is only as true as the plays it counts.",
          "The sample floor has to be met. @hl-bos/football refuses to report a percentage from fewer than 8 confirmed plays, and that refusal is the point — '3rd and long: pass 81%' from four snaps is noise wearing a percent sign.",
          "Front, coverage and pressure need confirming on opponent plays specifically. Tags on our own film say nothing about theirs.",
        ]}
      />
    </>
  );
}
