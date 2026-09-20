"use client";

import { useState, useTransition } from "react";

import { directScene, generateScene } from "@/actions/sceneflow";
import { PhotoPicker } from "@/components/PhotoPicker";
import type { StoredPhoto } from "@/lib/photos";
import type { DirectorResult } from "@/lib/direct";
import type { WorkerOutcome } from "@/lib/worker";

const INTERACTIONS: ReadonlyArray<{ value: string; label: string; level: string }> = [
  { value: "talk", label: "Talk", level: "warm" },
  { value: "stand-together", label: "Stand Together", level: "warm" },
  { value: "sit-together", label: "Sit Together", level: "warm" },
  { value: "hold-hands", label: "Hold Hands", level: "warm" },
  { value: "touch-arm", label: "Touch Arm", level: "warm" },
  { value: "touch-shoulder", label: "Touch Shoulder", level: "warm" },
  { value: "cheek-kiss", label: "Cheek Kiss", level: "warm" },
  { value: "laugh", label: "Laugh", level: "warm" },
  { value: "move-closer", label: "Move Closer", level: "warm" },
  { value: "whisper", label: "Whisper", level: "romantic" },
  { value: "embrace", label: "Embrace", level: "romantic" },
  { value: "embrace-from-behind", label: "Embrace From Behind", level: "romantic" },
  { value: "cuddle", label: "Cuddle", level: "romantic" },
  { value: "share-blanket", label: "Share a Blanket", level: "romantic" },
  { value: "head-on-chest", label: "Head on Chest", level: "romantic" },
  { value: "forehead-to-forehead", label: "Foreheads Together", level: "romantic" },
  { value: "slow-dance", label: "Slow Dance", level: "romantic" },
  { value: "lift", label: "Lifted", level: "romantic" },
  { value: "forehead-kiss", label: "Forehead Kiss", level: "romantic" },
  { value: "touch-clothed-knee", label: "Touch Clothed Knee", level: "romantic" },
  { value: "kiss", label: "Kiss", level: "passionate" },
  { value: "neck-kiss", label: "Kiss the Neck", level: "passionate" },
  { value: "hand-in-hair", label: "Hand in Hair", level: "passionate" },
  {
    value: "hand-on-chest",
    label: "Hand on Chest (over clothing)",
    level: "passionate",
  },
  { value: "pull-close", label: "Pull Close by the Shirt", level: "passionate" },
  { value: "loosen-tie", label: "Loosen a Tie", level: "passionate" },
  { value: "remove-jacket", label: "Take a Jacket Off", level: "passionate" },
  { value: "touch-waist", label: "Touch Waist", level: "passionate" },
  { value: "face-touch", label: "Touch Face", level: "passionate" },
  { value: "touch-clothed-thigh", label: "Touch Clothed Thigh", level: "passionate" },
  { value: "recline-together", label: "Recline Together", level: "private-romance" },
  { value: "wake-together", label: "Wake Together", level: "private-romance" },
  { value: "goodnight", label: "Goodnight", level: "private-romance" },
];

const WARDROBE: readonly string[] = [
  "as photographed",
  "evening wear",
  "elegant casual",
  "formal",
  "vacation and swimwear",
  "sleepwear",
  "a robe",
  "stockings and evening wear",
];

const SETTINGS: readonly string[] = [
  "as photographed",
  "luxury suite",
  "a bedroom, warmly lit",
  "a hotel room at night",
  "a couch by a fireplace",
  "a balcony over a city",
  "a beach at sunset",
  "a Tuscan terrace",
  "a modern home",
];

const SHOTS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "same", label: "Same as the photo" },
  { value: "closer", label: "Closer" },
  { value: "wider", label: "Wider" },
  { value: "side-angle", label: "From the side" },
  { value: "over-shoulder", label: "Over the shoulder" },
  { value: "portrait", label: "Portrait" },
  { value: "full-body", label: "Full body" },
];

const LEVELS = [
  { value: "warm", label: "Warm" },
  { value: "romantic", label: "Romantic" },
  { value: "passionate", label: "Passionate" },
  { value: "private-romance", label: "Private Romance" },
] as const;

const KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

const field = {
  background: "#0d1117",
  border: "1px solid #262c36",
  borderRadius: 8,
  color: "#c9d1d9",
  padding: "7px 9px",
  fontSize: 13,
  width: "100%",
} as const;

const label = {
  display: "block",
  fontSize: 12,
  color: "#8b949e",
  marginBottom: 5,
} as const;

export function SceneDirector() {
  const [castSize, setCastSize] = useState(2);
  const [adult, setAdult] = useState(false);
  const [permission, setPermission] = useState(false);
  const [actorA, setActorA] = useState("person_a");
  const [actorB, setActorB] = useState("person_b");
  const [interaction, setInteraction] = useState("embrace");
  const [intimacy, setIntimacy] = useState<string>("romantic");
  const [reciprocal, setReciprocal] = useState(false);
  const [setting, setSetting] = useState("luxury suite");
  const [wardrobe, setWardrobe] = useState("evening wear");
  const [shot, setShot] = useState("same");
  const [mood, setMood] = useState("romantic");
  const [direction, setDirection] = useState("");
  const [result, setResult] = useState<DirectorResult | null>(null);
  const [outcome, setOutcome] = useState<WorkerOutcome | null>(null);
  const [photos, setPhotos] = useState<readonly StoredPhoto[]>([]);
  const [pending, start] = useTransition();

  const ids = KEYS.slice(0, castSize).map((k) => `person_${k}`);

  function currentInput() {
    return {
      castSize,
      adultConfirmed: adult,
      permissionConfirmed: permission,
      actors: [actorA, actorB] as never,
      interaction,
      intimacy: intimacy as never,
      reciprocal,
      setting,
      wardrobe,
      mood,
      customDirection: direction,
      shot,
    };
  }

  function run() {
    start(async () => {
      setOutcome(null);
      setResult(await directScene(currentInput()));
    });
  }

  function make() {
    start(async () => {
      const res = await generateScene(currentInput(), photos[0]?.relativePath ?? "");
      if (res.refusal) {
        setResult(res.refusal);
        setOutcome(null);
        return;
      }
      setOutcome(res.outcome);
    });
  }

  const ready = adult && permission;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section
        style={{
          background: "#12151a",
          border: "1px solid #262c36",
          borderRadius: 12,
          padding: "18px 20px",
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Direct the scene</h2>

        <div
          style={{
            marginBottom: 14,
            paddingBottom: 14,
            borderBottom: "1px solid #262c36",
          }}
        >
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={label} htmlFor="castSize">
              How many adults are in the photograph
            </label>
            <select
              id="castSize"
              style={field}
              value={castSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                setCastSize(n);
                if (!KEYS.slice(0, n).some((k) => `person_${k}` === actorA)) {
                  setActorA("person_a");
                }
                if (!KEYS.slice(0, n).some((k) => `person_${k}` === actorB)) {
                  setActorB("person_b");
                }
              }}
            >
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="intimacy">
              How far it goes
            </label>
            <select
              id="intimacy"
              style={field}
              value={intimacy}
              onChange={(e) => setIntimacy(e.target.value)}
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="actorA">
              Who
            </label>
            <select
              id="actorA"
              style={field}
              value={actorA}
              onChange={(e) => setActorA(e.target.value)}
            >
              {ids.map((id) => (
                <option key={id} value={id}>
                  Person {id.slice(-1).toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="actorB">
              and who
            </label>
            <select
              id="actorB"
              style={field}
              value={actorB}
              onChange={(e) => setActorB(e.target.value)}
            >
              {ids.map((id) => (
                <option key={id} value={id}>
                  Person {id.slice(-1).toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label} htmlFor="interaction">
              What they do
            </label>
            <select
              id="interaction"
              style={field}
              value={interaction}
              onChange={(e) => setInteraction(e.target.value)}
            >
              {INTERACTIONS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label} — {i.level}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="setting">
              Where
            </label>
            <input
              id="setting"
              list="settingOptions"
              style={field}
              value={setting}
              onChange={(e) => setSetting(e.target.value)}
            />
            <datalist id="settingOptions">
              {SETTINGS.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={label} htmlFor="wardrobe">
              Wearing
            </label>
            <input
              id="wardrobe"
              list="wardrobeOptions"
              style={field}
              value={wardrobe}
              onChange={(e) => setWardrobe(e.target.value)}
            />
            <datalist id="wardrobeOptions">
              {WARDROBE.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={label} htmlFor="shot">
              Camera
            </label>
            <select
              id="shot"
              style={field}
              value={shot}
              onChange={(e) => setShot(e.target.value)}
            >
              {SHOTS.map((sh) => (
                <option key={sh.value} value={sh.value}>
                  {sh.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="mood">
              Mood
            </label>
            <input
              id="mood"
              style={field}
              value={mood}
              onChange={(e) => setMood(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6 }}>
            <label style={{ fontSize: 13, color: "#c9d1d9" }}>
              <input
                type="checkbox"
                checked={reciprocal}
                onChange={(e) => setReciprocal(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Reciprocal affection
            </label>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label} htmlFor="direction">
              In your own words (optional)
            </label>
            <input
              id="direction"
              style={field}
              value={direction}
              placeholder="Have Person B kiss Person D while the others move closer."
              onChange={(e) => setDirection(e.target.value)}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid #262c36",
            fontSize: 13,
            color: "#c9d1d9",
            display: "grid",
            gap: 6,
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            I confirm everyone shown is 18 or older.
          </label>
          <label>
            <input
              type="checkbox"
              checked={permission}
              onChange={(e) => setPermission(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            I confirm I have permission to use these images.
          </label>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8b949e" }}>
            This records what you state. It does not verify anything, and it is not
            evidence of consent.
          </p>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={pending || !ready}
          style={{
            marginTop: 14,
            background: ready ? "#238636" : "#21262d",
            border: "1px solid #2ea043",
            borderColor: ready ? "#2ea043" : "#30363d",
            borderRadius: 8,
            color: ready ? "#fff" : "#6e7681",
            padding: "9px 16px",
            fontSize: 13,
            cursor: ready && !pending ? "pointer" : "not-allowed",
          }}
        >
          {pending ? "Working…" : "Direct the scene"}
        </button>
      </section>

      {result !== null && (
        <Result result={result} onMake={make} pending={pending} outcome={outcome} />
      )}
    </div>
  );
}

function Result({
  result,
  onMake,
  pending,
  outcome,
}: {
  result: DirectorResult;
  onMake: () => void;
  pending: boolean;
  outcome: WorkerOutcome | null;
}) {
  if (result.kind === "refused") {
    return (
      <section
        style={{
          background: "#1a1009",
          border: "1px solid #5a2e11",
          borderRadius: 12,
          padding: "18px 20px",
        }}
      >
        <strong style={{ fontSize: 14 }}>SceneFlow did not stage that.</strong>
        <p
          style={{ margin: "6px 0 0", fontSize: 13, color: "#c9d1d9", lineHeight: 1.6 }}
        >
          {result.message}
        </p>
        {result.alternative !== null && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13,
              color: "#8b949e",
              lineHeight: 1.6,
            }}
          >
            Try instead: {result.alternative}
          </p>
        )}
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6e7681" }}>
          Stopped at: {result.stage} · {result.reasonCodes.join(", ")}
        </p>
      </section>
    );
  }

  return (
    <section
      style={{
        background: "#12151a",
        border: "1px solid #262c36",
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
      <h2 style={{ margin: "0 0 4px", fontSize: 15 }}>The scene, as directed</h2>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#d29922" }}>
        No picture yet. This is the scene the engine built and the exact instruction it
        would send — press "Make the picture" to try it on this machine.
      </p>

      <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "#8b949e" }}>
        Who is doing what
      </h3>
      <ul
        style={{
          margin: "0 0 14px",
          padding: "0 0 0 18px",
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        {result.interactions.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "#8b949e" }}>
        Where they stand
      </h3>
      <ul
        style={{
          margin: "0 0 14px",
          padding: "0 0 0 18px",
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        {result.placements.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onMake}
        disabled={pending}
        style={{
          margin: "0 0 14px",
          background: "#1f6feb",
          border: "1px solid #388bfd",
          borderRadius: 8,
          color: "#fff",
          padding: "9px 16px",
          fontSize: 13,
          cursor: pending ? "not-allowed" : "pointer",
        }}
      >
        {pending ? "Trying…" : "Make the picture"}
      </button>

      {outcome !== null && <Outcome outcome={outcome} />}

      <details>
        <summary style={{ fontSize: 13, color: "#58a6ff", cursor: "pointer" }}>
          The exact instruction that would be sent
        </summary>
        <pre
          style={{
            margin: "10px 0 0",
            padding: "12px",
            background: "#0d1117",
            border: "1px solid #262c36",
            borderRadius: 8,
            color: "#8b949e",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
          }}
        >
          {result.prompt}
        </pre>
      </details>
    </section>
  );
}

function Outcome({ outcome }: { outcome: WorkerOutcome }) {
  if (outcome.ok) {
    return (
      <div
        style={{
          background: "#0d1a12",
          border: "1px solid #1f6f3f",
          borderRadius: 8,
          padding: "12px 14px",
          marginBottom: 14,
          fontSize: 13,
          lineHeight: 1.6,
          color: "#c9d1d9",
        }}
      >
        <strong>Picture made.</strong> {outcome.model}
        {outcome.adapterKind === "mock" && (
          <span style={{ color: "#d29922" }}>
            {" "}
            — this is a PLACEHOLDER, not a generated photograph.
          </span>
        )}
        <div style={{ marginTop: 6, color: "#8b949e", fontSize: 12 }}>
          {outcome.imagePath}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        background: "#1a1009",
        border: "1px solid #5a2e11",
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 14,
        fontSize: 13,
        lineHeight: 1.6,
        color: "#c9d1d9",
      }}
    >
      <strong>No picture was made.</strong>
      <p style={{ margin: "6px 0 0" }}>{outcome.errorMessage}</p>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6e7681" }}>
        Nothing was substituted in its place.
      </p>
    </div>
  );
}
