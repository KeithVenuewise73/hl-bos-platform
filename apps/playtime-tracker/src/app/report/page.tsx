"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import {
  buildReport,
  clockText,
  computeGameState,
  FINAL_STATUS_LABEL,
  minimumText,
  percentText,
  playerLabel,
  PERIOD_NOUN,
  reportText,
  SPORT_LABEL,
} from "@hl-bos/playtime-engine";
import { Empty, Field, InfoNote, Loading, TopBar, WarnNote } from "@/components/ui";
import { useMounted, useNow, useQueryParam, useStore } from "@/lib/hooks";
import { game, gameLog, player, setScore, team } from "@/lib/store";

/**
 * The playtime report.
 *
 * Built from the same computed state the live screen uses, so the number a
 * coach saw at the final whistle is the number that gets shared. Two code
 * paths producing "roughly the same" total is how a product loses an argument
 * with a parent.
 */
function ReportScreen() {
  const mounted = useMounted();
  const id = useQueryParam("id");

  if (!mounted || id === null) {
    return (
      <main>
        <TopBar back="/" />
        <Loading />
      </main>
    );
  }
  return <Report gameId={id} />;
}

function Report({ gameId }: { gameId: string }) {
  const now = useNow(5000);
  const g = useStore(() => game(gameId));
  const events = useStore(() => gameLog(gameId));
  const t = useStore(() => (g ? team(g.teamId) : undefined));
  const [shareNote, setShareNote] = useState<string | null>(null);

  if (g === undefined) {
    return (
      <main>
        <TopBar back="/" />
        <Empty title="That game is not on this device" />
      </main>
    );
  }

  const sport = t?.sport ?? "other";
  const state = computeGameState({
    gameId: g.id,
    rosterPlayerIds: g.rosterPlayerIds,
    periodCount: g.periodCount,
    periodSeconds: g.periodSeconds,
    minimum: g.minimum,
    events,
    now,
  });

  const report = buildReport({
    state,
    teamName: t?.name ?? "My team",
    sport,
    opponent: g.opponent || "Unnamed opponent",
    gameDate: g.gameDate,
    minimum: g.minimum,
    score: g.score,
    periodsPlayed: Math.max(state.currentPeriod, 0),
    label: (id) => {
      const p = player(id);
      return p ? playerLabel(p) : "Athlete no longer on this device";
    },
  });

  const longest = report.rows.reduce((m, r) => Math.max(m, r.secondsPlayed), 0);

  async function share() {
    const text = reportText(report);
    const nav = navigator as Navigator & {
      share?: (data: { title: string; text: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ title: "PlayTime Report", text });
        return;
      } catch {
        // A cancelled share is not a failure; fall through to the clipboard so
        // the coach still ends up with the report in hand.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareNote("The report was copied to your clipboard.");
    } catch {
      setShareNote(
        "This device would not let the app share or copy. The report is shown below.",
      );
    }
  }

  return (
    <main>
      <TopBar
        back="/"
        action={
          state.phase !== "final" ? (
            <Link className="btn btn-small" href={`/game/?id=${g.id}`}>
              Back to game
            </Link>
          ) : null
        }
      />

      <h1>Playtime report</h1>
      <p className="lead">
        {report.teamName} vs {report.opponent} · {report.gameDate}
      </p>

      {!report.complete ? (
        <WarnNote>
          This game has not been ended, so these totals are still live and will keep
          changing.
        </WarnNote>
      ) : null}

      <div className="card">
        <div className="row">
          <div className="grow">
            <div className="muted">Game time tracked</div>
            <strong className="tabular" style={{ fontSize: 22 }}>
              {clockText(report.gameSeconds)}
            </strong>
          </div>
          <div>
            <div className="muted">{SPORT_LABEL[sport]}</div>
            <strong>
              {report.periodsPlayed} {PERIOD_NOUN[sport].toLowerCase()}
              {report.periodsPlayed === 1 ? "" : "s"}
            </strong>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {minimumText(g.minimum)}
        </div>
      </div>

      <ScoreEditor gameId={g.id} score={g.score} />

      <h2>Every athlete</h2>
      <div className="card">
        {report.rows.map((row) => (
          <div className="report-row" key={row.playerId}>
            <div className="grow">
              <strong>{row.label}</strong>
              <div className="muted">
                {row.entries} {row.entries === 1 ? "entry" : "entries"}
                {row.status === "no_target"
                  ? ""
                  : ` · ${row.status === "minimum_met" ? FINAL_STATUS_LABEL.safe : FINAL_STATUS_LABEL.below_target}`}
              </div>
              <div className="bar" aria-hidden="true">
                <span
                  style={{
                    width:
                      longest > 0
                        ? `${Math.round((row.secondsPlayed / longest) * 100)}%`
                        : "0%",
                    background:
                      row.status === "below_minimum" ? "var(--below)" : "var(--accent)",
                  }}
                />
              </div>
            </div>
            <div className="figures">
              <div className="big">{clockText(row.secondsPlayed)}</div>
              <div className="muted">{percentText(row.share)}</div>
            </div>
          </div>
        ))}
      </div>

      {report.didNotPlay > 0 ? (
        <InfoNote>
          {report.didNotPlay} athlete{report.didNotPlay === 1 ? "" : "s"} on this
          game&rsquo;s roster recorded no playing time. They are listed above at 0:00
          rather than hidden.
        </InfoNote>
      ) : null}

      {shareNote ? <InfoNote>{shareNote}</InfoNote> : null}

      <div className="sticky-actions">
        <button
          type="button"
          className="btn-primary btn-block"
          onClick={() => void share()}
        >
          Share this report
        </button>
      </div>

      <h2>As text</h2>
      <p className="muted">Exactly what gets shared.</p>
      <pre
        className="card"
        style={{ whiteSpace: "pre-wrap", fontSize: 13, overflowX: "auto", margin: 0 }}
      >
        {reportText(report)}
      </pre>
    </main>
  );
}

function ScoreEditor({
  gameId,
  score,
}: {
  gameId: string;
  score: { us: number; them: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const [us, setUs] = useState(score ? String(score.us) : "");
  const [them, setThem] = useState(score ? String(score.them) : "");

  if (!open) {
    return (
      <div className="card row tight">
        <div className="grow">
          <div className="muted">Final score</div>
          {/* No score entered stays "not recorded". Rendering 0-0 would be an
              invented result, and the whole product depends on not doing that. */}
          <strong>{score ? `${score.us} – ${score.them}` : "Not recorded"}</strong>
        </div>
        <button type="button" className="btn-small" onClick={() => setOpen(true)}>
          {score ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="field-row">
        <Field label="Us">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={us}
            onChange={(e) => setUs(e.target.value)}
          />
        </Field>
        <Field label="Them">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={them}
            onChange={(e) => setThem(e.target.value)}
          />
        </Field>
      </div>
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            const a = Number(us);
            const b = Number(them);
            setScore(
              gameId,
              Number.isFinite(a) && Number.isFinite(b) && us !== "" && them !== ""
                ? { us: Math.max(0, Math.round(a)), them: Math.max(0, Math.round(b)) }
                : null,
            );
            setOpen(false);
          }}
        >
          Save score
        </button>
      </div>
    </div>
  );
}

/**
 * useSearchParams is empty during prerender, so this screen renders its
 * loading state at build time and the real record once the device takes over.
 */
export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <main>
          <TopBar back="/" />
          <Loading />
        </main>
      }
    >
      <ReportScreen />
    </Suspense>
  );
}
