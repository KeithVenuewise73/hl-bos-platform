import {
  ACCENTS,
  OUTPUT_TYPES,
  TEMPLATES,
  TONES,
  type OutputType,
  type Tone,
} from "@hl-bos/hype-video";

import { Steps } from "@/components/Steps.tsx";
import { saveTemplate } from "@/lib/actions.ts";
import { loadProject } from "@/lib/load.ts";

export const dynamic = "force-dynamic";

const TONE_HINT: Record<Tone, string> = {
  cinematic: "Movie-trailer drama",
  aggressive: "Loud, intense, game-face",
  inspirational: "Uplifting, work-ethic",
  emotional: "Heartfelt, proud",
  fun: "Playful, family-friendly",
  professional: "Clean, coach-ready",
};

const OUTPUT_LABEL: Record<OutputType, string> = {
  short_social_post: "Short social post",
  hype_script: "Hype script (15s + 30s)",
  voiceover_script: "Voiceover script",
  full_video_prompt: "Full AI video + music prompt",
  caption_package: "Caption package (hashtags + on-screen text)",
};

const SWATCH: Record<(typeof ACCENTS)[number], string> = {
  red: "#e11d2e",
  gold: "#f5b301",
  blue: "#2f6bff",
};

export default async function TemplateSelection({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const project = await loadProject((await params).id);

  return (
    <div data-accent={project.accent}>
      <div className="kicker">{project.name}</div>
      <h1>Choose the style</h1>
      <Steps project={project} current="template" />

      <form
        action={saveTemplate.bind(null, project.id)}
        className="grid"
        style={{ gap: 20 }}
      >
        <section className="card">
          <h2>Template</h2>
          <div className="choices">
            {TEMPLATES.map((t) => (
              <label key={t.key} className="choice">
                <input
                  type="radio"
                  name="template"
                  value={t.key}
                  defaultChecked={t.key === project.template}
                />
                <span className="tile">
                  <strong>{t.name}</strong>
                  <span>{t.tagline}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Tone</h2>
          <div className="choices">
            {TONES.map((tone) => (
              <label key={tone} className="choice">
                <input
                  type="radio"
                  name="tone"
                  value={tone}
                  defaultChecked={tone === project.tone}
                />
                <span className="tile">
                  <strong style={{ textTransform: "capitalize" }}>{tone}</strong>
                  <span>{TONE_HINT[tone]}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <div className="grid-2">
          <section className="card">
            <h2>What do you need most?</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              You always get the full package; these are shown first.
            </p>
            <div className="grid" style={{ gap: 8 }}>
              {OUTPUT_TYPES.map((o) => (
                <label key={o} className="check">
                  <input
                    type="checkbox"
                    name="outputTypes"
                    value={o}
                    defaultChecked={project.outputTypes.includes(o)}
                  />
                  <span>{OUTPUT_LABEL[o]}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Accent color</h2>
            <div className="choices" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {ACCENTS.map((a) => (
                <label key={a} className="choice">
                  <input
                    type="radio"
                    name="accent"
                    value={a}
                    defaultChecked={a === project.accent}
                  />
                  <span className="tile">
                    <strong style={{ textTransform: "capitalize" }}>
                      <span className="swatch" style={{ background: SWATCH[a] }} />
                      {a}
                    </strong>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="row">
          <button type="submit" className="btn big">
            Save &amp; go to hype package →
          </button>
        </div>
      </form>
    </div>
  );
}
