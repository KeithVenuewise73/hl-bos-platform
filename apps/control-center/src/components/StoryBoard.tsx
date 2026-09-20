"use client";

import { useState, useTransition } from "react";

import { planStory } from "@/actions/sceneflow";
import { PhotoPicker } from "@/components/PhotoPicker";
import { STORY_PRESETS, type StoryResult } from "@/lib/sceneflow-story";
import type { StoredPhoto } from "@/lib/sceneflow-photos";

const LEVELS = [
  { value: "warm", label: "Warm" },
  { value: "romantic", label: "Romantic" },
  { value: "passionate", label: "Passionate" },
  { value: "private-romance", label: "Private Romance" },
] as const;

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

const CARD = {
  background: "#12151a",
  border: "1px solid #262c36",
  borderRadius: 12,
  padding: "18px 20px",
} as const;

export function StoryBoard() {
  const [castSize, setCastSize] = useState(2);
  const [preset, setPreset] = useState("luxury-suite");
  const [scenes, setScenes] = useState<1 | 3 | 6>(6);
  const [intimacy, setIntimacy] = useState<string>("romantic");
  const [reciprocal, setReciprocal] = useState(false);
  const [setting, setSetting] = useState("luxury suite");
  const [wardrobe, setWardrobe] = useState("evening wear");
  const [direction, setDirection] = useState("");
  const [adult, setAdult] = useState(false);
  const [permission, setPermission] = useState(false);
  const [photos, setPhotos] = useState<readonly StoredPhoto[]>([]);
  const [result, setResult] = useState<StoryResult | null>(null);
  const [pending, start] = useTransition();

  const ready = adult && permission;

  function run() {
    start(async () => {
      setResult(
        await planStory({
          castSize,
          adultConfirmed: adult,
          permissionConfirmed: permission,
          presetSlug: preset,
          scenes,
          intimacy: intimacy as never,
          reciprocal,
          setting,
          wardrobe,
          customDirection: direction,
          photoPaths: photos.map((p) => p.relativePath),
        }),
      );
    });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={CARD}>
        <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Plan a story</h2>

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
            <label style={label} htmlFor="preset">
              Story
            </label>
            <select
              id="preset"
              style={field}
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              {STORY_PRESETS.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                  {p.group ? " (group)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="scenes">
              How many scenes
            </label>
            <select
              id="scenes"
              style={field}
              value={scenes}
              onChange={(e) => setScenes(Number(e.target.value) as 1 | 3 | 6)}
            >
              <option value={1}>1</option>
              <option value={3}>3</option>
              <option value={6}>6</option>
            </select>
          </div>

          <div>
            <label style={label} htmlFor="storyCast">
              How many adults
            </label>
            <select
              id="storyCast"
              style={field}
              value={castSize}
              onChange={(e) => setCastSize(Number(e.target.value))}
            >
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="storyIntimacy">
              How far it goes
            </label>
            <select
              id="storyIntimacy"
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
            <label style={label} htmlFor="storySetting">
              Where
            </label>
            <input
              id="storySetting"
              style={field}
              value={setting}
              onChange={(e) => setSetting(e.target.value)}
            />
          </div>

          <div>
            <label style={label} htmlFor="storyWardrobe">
              Wearing
            </label>
            <input
              id="storyWardrobe"
              style={field}
              value={wardrobe}
              onChange={(e) => setWardrobe(e.target.value)}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label} htmlFor="storyDirection">
              In your own words (optional)
            </label>
            <input
              id="storyDirection"
              style={field}
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
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
        </div>

        <button
          type="button"
          onClick={run}
          disabled={pending || !ready}
          style={{
            marginTop: 14,
            background: ready ? "#238636" : "#21262d",
            border: "1px solid " + (ready ? "#2ea043" : "#30363d"),
            borderRadius: 8,
            color: ready ? "#fff" : "#6e7681",
            padding: "9px 16px",
            fontSize: 13,
            cursor: ready && !pending ? "pointer" : "not-allowed",
          }}
        >
          {pending ? "Working…" : "Plan the story"}
        </button>
      </section>

      {result !== null && <StoryResultView result={result} />}
    </div>
  );
}

function StoryResultView({ result }: { result: StoryResult }) {
  if (result.kind === "refused") {
    return (
      <section
        style={{
          ...CARD,
          background: "#1a1009",
          borderColor: "#5a2e11",
        }}
      >
        <strong style={{ fontSize: 14 }}>SceneFlow did not stage that.</strong>
        <p
          style={{ margin: "6px 0 0", fontSize: 13, color: "#c9d1d9", lineHeight: 1.6 }}
        >
          {result.message}
        </p>
        {result.alternative !== null && (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#8b949e" }}>
            Try instead: {result.alternative}
          </p>
        )}
      </section>
    );
  }

  return (
    <section style={CARD}>
      <h2 style={{ margin: "0 0 4px", fontSize: 15 }}>{result.title}</h2>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "#d29922" }}>
        {result.panels.length} scene{result.panels.length === 1 ? "" : "s"} planned from{" "}
        {result.photoCount === 0
          ? "no photograph"
          : `${result.photoCount} photograph${result.photoCount === 1 ? "" : "s"}`}
        . No pictures were made — this is the story the engine built, and each scene
        continues from the one before it.
      </p>
      {result.photoCount === 0 && (
        <p style={{ margin: "-8px 0 16px", fontSize: 12.5, color: "#8b949e" }}>
          Add a photograph above and every scene will be built to continue it.
        </p>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {result.panels.map((panel) => (
          <div
            key={panel.number}
            style={{
              border: "1px solid #262c36",
              borderRadius: 10,
              padding: "12px 14px",
              background: "#0d1117",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 8,
              }}
            >
              <strong style={{ fontSize: 14 }}>
                {panel.number}. {panel.title}
              </strong>
              <span style={{ fontSize: 11.5, color: "#6e7681" }}>{panel.intimacy}</span>
            </div>
            <ul
              style={{
                margin: 0,
                padding: "0 0 0 18px",
                fontSize: 13,
                lineHeight: 1.6,
                color: "#c9d1d9",
              }}
            >
              {panel.interactions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12.5, color: "#58a6ff", cursor: "pointer" }}>
                Instruction for this scene
              </summary>
              <pre
                style={{
                  margin: "8px 0 0",
                  padding: 10,
                  background: "#010409",
                  border: "1px solid #262c36",
                  borderRadius: 8,
                  color: "#8b949e",
                  fontSize: 11.5,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                }}
              >
                {panel.prompt}
              </pre>
            </details>
          </div>
        ))}
      </div>
    </section>
  );
}
