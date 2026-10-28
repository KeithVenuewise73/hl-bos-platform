"use client";

import { type JerseyShade, suggestOtherJersey } from "@hl-bos/jersey-sort/teams";
import { useState } from "react";

/**
 * Home team + jersey, away team + jersey. Choosing Light for one team
 * suggests Dark for the other (and the other way round) while the other is
 * still unset; the person can change either. Plain radio buttons, so the
 * form works without JavaScript too.
 */
export function TeamJerseys({
  homeTeam,
  awayTeam,
  homeJersey,
  awayJersey,
  idPrefix = "",
}: {
  /** Keeps element ids unique when several forms are on one page. */
  idPrefix?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeJersey: JerseyShade | null;
  awayJersey: JerseyShade | null;
}) {
  const [home, setHome] = useState<JerseyShade | null>(homeJersey);
  const [away, setAway] = useState<JerseyShade | null>(awayJersey);
  const [touched, setTouched] = useState({
    home: homeJersey !== null,
    away: awayJersey !== null,
  });

  function pick(side: "home" | "away", shade: JerseyShade) {
    if (side === "home") {
      setHome(shade);
      if (!touched.away) setAway(suggestOtherJersey(shade));
    } else {
      setAway(shade);
      if (!touched.home) setHome(suggestOtherJersey(shade));
    }
    setTouched((t) => ({ ...t, [side]: true }));
  }

  return (
    <>
      <Side
        side="home"
        idPrefix={idPrefix}
        label="Home team"
        nameField="team"
        team={homeTeam}
        placeholder="Caz"
        required
        shade={home}
        onPick={(s) => pick("home", s)}
      />
      <Side
        side="away"
        idPrefix={idPrefix}
        label="Away team"
        nameField="opponent"
        team={awayTeam}
        placeholder="Wheatfield"
        required={false}
        shade={away}
        onPick={(s) => pick("away", s)}
      />
      <p className="text-xs text-muted sm:col-span-2" data-testid="jersey-help">
        One team in light jerseys, the other in dark: that is how JerseySort tells Caz
        #22 from Wheatfield #22. Choosing one suggests the other; change it if needed.
      </p>
    </>
  );
}

function Side({
  side,
  idPrefix,
  label,
  nameField,
  team,
  placeholder,
  required,
  shade,
  onPick,
}: {
  side: "home" | "away";
  idPrefix: string;
  label: string;
  nameField: string;
  team: string | undefined;
  placeholder: string;
  required: boolean;
  shade: JerseyShade | null;
  onPick: (s: JerseyShade) => void;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <label className="label" htmlFor={`${idPrefix}${nameField}`}>
        {label}
      </label>
      <input
        className="input"
        id={`${idPrefix}${nameField}`}
        name={nameField}
        required={required}
        defaultValue={team ?? ""}
        placeholder={placeholder}
      />
      <fieldset className="mt-2">
        <legend className="label mb-1">{label.replace(" team", "")} jersey</legend>
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((s) => (
            <label
              key={s}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold ${
                shade === s ? "border-brand bg-brand/10" : "border-line"
              }`}
            >
              <input
                type="radio"
                name={`${side}_jersey`}
                value={s}
                checked={shade === s}
                onChange={() => onPick(s)}
              />
              <span
                aria-hidden
                className={`inline-block h-3 w-3 rounded-full border border-line ${s === "light" ? "bg-white" : "bg-black"}`}
              />
              {s === "light" ? "Light" : "Dark"}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
