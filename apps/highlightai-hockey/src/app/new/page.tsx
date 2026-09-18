import { JERSEY_COLORS, POSITIONS } from "@hl-bos/hockey-highlights";

import { ActionForm } from "@/components/Forms.tsx";
import { Card } from "@/components/ui.tsx";
import { createProject } from "@/lib/actions.ts";

const POSITION_LABELS: Record<string, string> = {
  forward: "Forward",
  defense: "Defense",
  goalie: "Goalie",
};

export default function NewProject() {
  return (
    <>
      <h1>New game</h1>
      <Card
        title="Who is this reel for?"
        footnote="The jersey colour and number are how the analysis finds your player among everyone else on the ice. The number matters most: it is the only thing that is unique to one player in a game."
      >
        <ActionForm action={createProject} label="Create game" busy="Creating…">
          <label>
            Game name
            <input name="name" required placeholder="Squirt A vs Northstars" />
          </label>
          <div className="row">
            <label>
              Game date
              <input name="gameDate" type="date" />
            </label>
            <label>
              Team
              <input name="team" placeholder="Riverside Squirt A" />
            </label>
            <label>
              Opponent
              <input name="opponent" placeholder="Northstars" />
            </label>
          </div>

          <h3>The player</h3>
          <div className="row">
            <label>
              Name
              <input name="athleteName" required placeholder="Sam Herman" />
            </label>
            <label>
              Jersey number
              <input
                name="jerseyNumber"
                required
                inputMode="numeric"
                pattern="\d{1,2}"
                placeholder="17"
              />
            </label>
          </div>
          <div className="row">
            <label>
              Jersey colour
              <select name="jerseyColorId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {JERSEY_COLORS.map((colour) => (
                  <option key={colour.id} value={colour.id}>
                    {colour.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Position
              <select name="position" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {POSITION_LABELS[position]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
