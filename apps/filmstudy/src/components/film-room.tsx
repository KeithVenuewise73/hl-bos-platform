"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  COVERAGES,
  DEFENSIVE_FRONTS,
  FORMATIONS,
  GRADE_SYMBOLS,
  PASS_CONCEPTS,
  PERSONNEL_PACKAGES,
  PRESSURES,
  RUN_CONCEPTS,
  describeConfidence,
  gradeTone,
  situationLabel,
  yardLineLabel,
} from "@hl-bos/football";
import {
  createClip,
  createPlay,
  deletePlay,
  resolvePrediction,
  setGrade,
  setParticipation,
  tagPlay,
  addNote,
  type ActionResult,
} from "@/app/actions";
import { timecode, playerLabel } from "@/lib/format";
import { Confidence, FieldStrip } from "./ui";
import type {
  GradeCategoryRow,
  GradeRow,
  NoteRow,
  ParticipationRow,
  PlayRow,
  PlayerRow,
  PredictionRow,
} from "@/lib/types";

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.5] as const;
/** One video frame at 30fps. Football coaches step frame by frame at the snap. */
const FRAME = 1 / 30;

/**
 * The film room.
 *
 * One client component owns playback, the keyboard and the selected play,
 * because those three things are the same interaction: a coach moving fast
 * through a game with one hand on the keyboard. Splitting them across
 * components would mean syncing a play head across a boundary, and the dropped
 * frame would land exactly at the snap.
 *
 * Everything it WRITES goes through a Server Action to a permission-checked
 * database function. The `canTag` / `canGrade` props decide what is rendered;
 * they decide nothing about what is permitted.
 */
export function FilmRoom(props: {
  filmId: string;
  teamId: string;
  teamLevel: string;
  gradeScale: "symbol" | "numeric";
  videoUrl: string | null;
  durationSeconds: number | null;
  playable: boolean;
  notPlayableReason: string;
  plays: readonly PlayRow[];
  participation: readonly ParticipationRow[];
  grades: readonly GradeRow[];
  predictions: readonly PredictionRow[];
  notes: readonly NoteRow[];
  players: readonly PlayerRow[];
  categories: readonly GradeCategoryRow[];
  canTag: boolean;
  canGrade: boolean;
  canClip: boolean;
  canAssign: boolean;
}) {
  const { plays, filmId, canTag, canGrade } = props;

  const video = useRef<HTMLVideoElement>(null);
  const [currentId, setCurrentId] = useState<string | null>(plays[0]?.id ?? null);
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [snapMark, setSnapMark] = useState<number | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const current = useMemo(
    () => plays.find((p) => p.id === currentId) ?? plays[0] ?? null,
    [plays, currentId],
  );
  const duration = props.durationSeconds ?? 0;

  const seek = useCallback((seconds: number) => {
    const element = video.current;
    if (element === null) {
      // No video (demo film, or an upload that never finished). The timeline
      // still moves so play windows can be read; it just moves nothing else.
      setTime(Math.max(0, seconds));
      return;
    }
    element.currentTime = Math.max(0, seconds);
    setTime(Math.max(0, seconds));
  }, []);

  const gotoPlay = useCallback(
    (play: PlayRow | undefined) => {
      if (play === undefined) return;
      setCurrentId(play.id);
      seek(play.start_seconds);
    },
    [seek],
  );

  const step = useCallback(
    (delta: number) => {
      const index = plays.findIndex((p) => p.id === current?.id);
      gotoPlay(plays[Math.min(plays.length - 1, Math.max(0, index + delta))]);
    },
    [plays, current, gotoPlay],
  );

  /**
   * Keyboard shortcuts from the brief's section 9. They are bound on the
   * document but ignored while focus is in a form control, otherwise typing a
   * formation name would pause the video and mark a snap.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      const element = video.current;
      switch (event.key) {
        case " ":
          event.preventDefault();
          if (element === null) return;
          if (element.paused) void element.play();
          else element.pause();
          return;
        case "ArrowLeft":
          event.preventDefault();
          if (event.shiftKey) seek(time - FRAME);
          else step(-1);
          return;
        case "ArrowRight":
          event.preventDefault();
          if (event.shiftKey) seek(time + FRAME);
          else step(1);
          return;
        case "s":
        case "S":
          event.preventDefault();
          setSnapMark(time);
          return;
        case "e":
        case "E":
          event.preventDefault();
          if (!canTag) return;
          if (markIn === null) {
            setMarkIn(time);
            return;
          }
          return;
        default:
          return;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [time, step, seek, markIn, canTag]);

  const currentParticipation = props.participation.filter(
    (p) => p.play_id === current?.id,
  );
  const currentGrades = props.grades.filter((g) => g.play_id === current?.id);
  const currentPredictions = props.predictions.filter(
    (p) => p.play_id === current?.id && p.state === "ai_suggested",
  );
  const currentNotes = props.notes.filter((n) => n.play_id === current?.id);
  const playerById = new Map(props.players.map((p) => [p.id, p]));

  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      setResult(await action());
    });
  }

  return (
    <>
      {result !== null ? (
        <div
          className={result.ok ? "notice accent" : "notice bad"}
          style={{ marginBottom: 12 }}
        >
          {result.message}
        </div>
      ) : null}

      <div className="film-room">
        {/* ---------------- LEFT: the play list ---------------- */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Plays ({plays.length})</span>
          </div>
          <div className="panel-scroll">
            {plays.length === 0 ? (
              <div className="panel-body">
                <p className="dim small" style={{ margin: 0 }}>
                  {canTag
                    ? "No plays yet. Scrub to the first snap, press Mark start, then Mark end."
                    : "No plays have been segmented on this film yet."}
                </p>
              </div>
            ) : (
              plays.map((play) => {
                const label = situationLabel({
                  ...(play.down !== null ? { down: play.down } : {}),
                  ...(play.distance !== null ? { distance: play.distance } : {}),
                });
                return (
                  <button
                    key={play.id}
                    type="button"
                    className="play-row"
                    aria-current={play.id === current?.id}
                    onClick={() => gotoPlay(play)}
                  >
                    <div className="row between">
                      <span className="play-row-num">PLAY {play.play_number}</span>
                      <span className="play-row-num">
                        {timecode(play.start_seconds)}
                      </span>
                    </div>
                    <div style={{ marginTop: 2 }}>
                      {label ?? <span className="faint">untagged</span>}
                      {play.formation === null ? "" : ` · ${play.formation}`}
                    </div>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {play.explosive ? (
                        <span className="badge accent">explosive</span>
                      ) : null}
                      {play.turnover ? (
                        <span className="badge bad">turnover</span>
                      ) : null}
                      {play.touchdown ? <span className="badge good">TD</span> : null}
                      {play.penalty ? (
                        <span className="badge warn">penalty</span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ---------------- CENTRE: the player ---------------- */}
        <div className="stack">
          <div className="video-frame">
            {props.videoUrl !== null ? (
              <video
                ref={video}
                src={props.videoUrl}
                controls={false}
                playsInline
                preload="metadata"
                onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
              />
            ) : (
              <div style={{ textAlign: "center", padding: 24 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No video to play</div>
                <div className="dim small" style={{ maxWidth: 420 }}>
                  {props.notPlayableReason}
                </div>
              </div>
            )}
          </div>

          <div className="row between">
            <div className="row">
              <button
                className="btn sm"
                type="button"
                disabled={!props.playable}
                onClick={() => {
                  const element = video.current;
                  if (element === null) return;
                  if (element.paused) void element.play();
                  else element.pause();
                }}
              >
                Play / Pause
              </button>
              <button
                className="btn sm"
                type="button"
                onClick={() => seek(time - FRAME)}
              >
                &#8676; Frame
              </button>
              <button
                className="btn sm"
                type="button"
                onClick={() => seek(time + FRAME)}
              >
                Frame &#8677;
              </button>
              <button className="btn sm" type="button" onClick={() => step(-1)}>
                Prev play
              </button>
              <button className="btn sm" type="button" onClick={() => step(1)}>
                Next play
              </button>
            </div>
            <div className="row">
              <span className="tiny faint">Speed</span>
              {PLAYBACK_RATES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value === rate ? "btn sm primary" : "btn sm ghost"}
                  onClick={() => {
                    setRate(value);
                    if (video.current !== null) video.current.playbackRate = value;
                  }}
                >
                  {value}x
                </button>
              ))}
            </div>
          </div>

          {/* Timeline: every segmented play, in place, on the real duration. */}
          <div
            className="timeline"
            role="presentation"
            onClick={(event) => {
              if (duration <= 0) return;
              const box = event.currentTarget.getBoundingClientRect();
              seek(((event.clientX - box.left) / box.width) * duration);
            }}
          >
            {duration > 0
              ? plays.map((play) => (
                  <span
                    key={play.id}
                    className={
                      play.id === current?.id
                        ? "timeline-play current"
                        : "timeline-play"
                    }
                    style={{
                      left: `${(play.start_seconds / duration) * 100}%`,
                      width: `${Math.max(0.4, ((play.end_seconds - play.start_seconds) / duration) * 100)}%`,
                    }}
                    title={`Play ${play.play_number}`}
                  />
                ))
              : null}
            {duration > 0 ? (
              <span
                className="timeline-head"
                style={{ left: `${(time / duration) * 100}%` }}
              />
            ) : null}
          </div>

          <div className="row between">
            <span className="mono small">
              {timecode(time)}
              {duration > 0 ? ` / ${timecode(duration)}` : ""}
            </span>
            <span className="row tiny faint">
              <kbd>Space</kbd> play <kbd>&larr;</kbd>/<kbd>&rarr;</kbd> play{" "}
              <kbd>Shift</kbd>+<kbd>&larr;</kbd>/<kbd>&rarr;</kbd> frame <kbd>S</kbd>{" "}
              snap
            </span>
          </div>

          {canTag ? (
            <div className="card">
              <div className="row between">
                <div className="row">
                  <button
                    className="btn sm"
                    type="button"
                    onClick={() => setMarkIn(time)}
                  >
                    Mark start {markIn === null ? "" : `(${timecode(markIn)})`}
                  </button>
                  <button
                    className="btn sm"
                    type="button"
                    onClick={() => setSnapMark(time)}
                  >
                    Mark snap {snapMark === null ? "" : `(${timecode(snapMark)})`}
                  </button>
                  <button
                    className="btn sm primary"
                    type="button"
                    disabled={markIn === null || time <= markIn || pending}
                    onClick={() =>
                      run(async () => {
                        const startAt = markIn ?? 0;
                        const snap =
                          snapMark !== null && snapMark >= startAt && snapMark <= time
                            ? snapMark
                            : null;
                        const created = await createPlay(filmId, startAt, time, snap);
                        if (created.ok) {
                          setMarkIn(null);
                          setSnapMark(null);
                        }
                        return created;
                      })
                    }
                  >
                    Mark end &amp; create play
                  </button>
                </div>
                {current !== null ? (
                  <button
                    className="btn sm danger"
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deletePlay(current.id, filmId))}
                  >
                    Delete play {current.play_number}
                  </button>
                ) : null}
              </div>
              {markIn !== null && time <= markIn ? (
                <p className="tiny faint" style={{ margin: "8px 0 0" }}>
                  Scrub past {timecode(markIn)} to close the play. A play cannot end
                  before it starts, and the database refuses it too.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* ---------------- RIGHT: play data ---------------- */}
        <div className="stack">
          {current === null ? (
            <div className="panel">
              <div className="panel-body">
                <p className="dim small" style={{ margin: 0 }}>
                  Select or create a play to tag it.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">Play {current.play_number}</span>
                  <span className="mono tiny faint">
                    {timecode(current.start_seconds)}&ndash;
                    {timecode(current.end_seconds)}
                  </span>
                </div>
                <div className="panel-body stack">
                  <FieldStrip
                    yardLine={current.yard_line}
                    possession={current.possession}
                  />
                  <div className="small dim">
                    {situationLabel({
                      ...(current.down !== null ? { down: current.down } : {}),
                      ...(current.distance !== null
                        ? { distance: current.distance }
                        : {}),
                    }) ?? "Down and distance not tagged"}
                    {" · "}
                    {yardLineLabel(
                      current.yard_line ?? undefined,
                      current.possession ?? undefined,
                    ) ?? "field position not tagged"}
                  </div>
                  {canTag ? (
                    <TagForm
                      key={current.id}
                      play={current}
                      filmId={filmId}
                      level={props.teamLevel}
                      onResult={setResult}
                    />
                  ) : (
                    <ReadOnlyTags play={current} />
                  )}
                </div>
              </div>

              {/* AI suggestions. Never merged silently; never auto-accepted. */}
              {currentPredictions.length > 0 ? (
                <div className="panel">
                  <div className="panel-head">
                    <span className="panel-title">FilmStudy AI suggestions</span>
                  </div>
                  <div className="panel-body stack">
                    <p className="tiny faint" style={{ margin: 0 }}>
                      Suggestions, not facts. Nothing below is team data until you
                      confirm it.
                    </p>
                    {currentPredictions.map((prediction) => {
                      const display = describeConfidence(prediction.confidence);
                      return (
                        <div
                          key={prediction.id}
                          style={{
                            borderTop: "1px solid var(--line)",
                            paddingTop: 10,
                          }}
                        >
                          <div className="row between">
                            <span
                              className="tiny faint"
                              style={{ textTransform: "uppercase" }}
                            >
                              {prediction.prediction_type}
                            </span>
                            <Confidence
                              confidence={prediction.confidence}
                              band={display.band}
                              label={`${display.percent}% · ${display.label}`}
                            />
                          </div>
                          <div style={{ fontWeight: 600, margin: "3px 0 2px" }}>
                            {prediction.predicted_value}
                          </div>
                          <div className="tiny faint">
                            {prediction.model} {prediction.model_version} &middot;{" "}
                            {display.guidance}
                          </div>
                          {canTag ? (
                            <div className="row" style={{ marginTop: 7 }}>
                              <button
                                className="btn sm primary"
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    resolvePrediction(
                                      prediction.id,
                                      filmId,
                                      "coach_confirmed",
                                    ),
                                  )
                                }
                              >
                                Accept
                              </button>
                              <button
                                className="btn sm"
                                type="button"
                                disabled={pending}
                                onClick={() => {
                                  const corrected = window.prompt(
                                    `What is the correct ${prediction.prediction_type}?`,
                                    prediction.predicted_value,
                                  );
                                  if (
                                    corrected === null ||
                                    corrected.trim().length === 0
                                  )
                                    return;
                                  run(() =>
                                    resolvePrediction(
                                      prediction.id,
                                      filmId,
                                      "coach_corrected",
                                      corrected.trim(),
                                    ),
                                  );
                                }}
                              >
                                Correct
                              </button>
                              <button
                                className="btn sm ghost"
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    resolvePrediction(
                                      prediction.id,
                                      filmId,
                                      "rejected",
                                    ),
                                  )
                                }
                              >
                                Reject
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Players on this play, and their grades. */}
              {props.players.length > 0 ? (
                <div className="panel">
                  <div className="panel-head">
                    <span className="panel-title">On the field</span>
                  </div>
                  <div className="panel-body stack">
                    {currentParticipation.length === 0 ? (
                      <p className="tiny faint" style={{ margin: 0 }}>
                        No players attached to this play yet. A grade needs one &mdash;
                        the database will not grade a player who is not recorded as
                        playing.
                      </p>
                    ) : (
                      currentParticipation.map((participant) => {
                        const player = playerById.get(participant.player_id);
                        if (player === undefined) return null;
                        return (
                          <div
                            key={participant.id}
                            style={{
                              borderTop: "1px solid var(--line)",
                              paddingTop: 9,
                            }}
                          >
                            <div className="row between">
                              <strong className="small">{playerLabel(player)}</strong>
                              <span className="tiny faint">
                                {participant.position ?? participant.unit}
                              </span>
                            </div>
                            {participant.assignment !== null ? (
                              <div className="tiny dim">{participant.assignment}</div>
                            ) : null}
                            {canGrade && props.gradeScale === "symbol" ? (
                              <div className="stack" style={{ gap: 6, marginTop: 7 }}>
                                {props.categories.map((category) => {
                                  const existing = currentGrades.find(
                                    (g) =>
                                      g.player_id === participant.player_id &&
                                      g.category_key === category.key,
                                  );
                                  return (
                                    <div key={category.key} className="row between">
                                      <span className="tiny faint">
                                        {category.label}
                                      </span>
                                      <span className="row" style={{ gap: 3 }}>
                                        {GRADE_SYMBOLS.map((symbol) => (
                                          <button
                                            key={symbol.value}
                                            type="button"
                                            className={`grade-mark ${gradeTone(symbol.value)}`}
                                            aria-pressed={
                                              existing?.symbol === symbol.value
                                            }
                                            title={symbol.label}
                                            disabled={pending}
                                            onClick={() =>
                                              run(() =>
                                                setGrade(
                                                  current.id,
                                                  participant.player_id,
                                                  category.key,
                                                  filmId,
                                                  { symbol: symbol.value },
                                                ),
                                              )
                                            }
                                          >
                                            {symbol.mark}
                                          </button>
                                        ))}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}

                    {canTag ? (
                      <form
                        action={(fd) => {
                          fd.set("play_id", current.id);
                          fd.set("film_id", filmId);
                          run(() => setParticipation(fd));
                        }}
                        style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
                      >
                        <div className="row">
                          <select name="player_id" required style={{ flex: 1 }}>
                            <option value="">Add a player&hellip;</option>
                            {props.players
                              .filter((p) => p.active)
                              .map((player) => (
                                <option key={player.id} value={player.id}>
                                  {playerLabel(player)}
                                </option>
                              ))}
                          </select>
                          <select name="unit" required style={{ width: 120 }}>
                            <option value="offense">Offense</option>
                            <option value="defense">Defense</option>
                            <option value="special_teams">Special</option>
                          </select>
                          <button className="btn sm" type="submit" disabled={pending}>
                            Add
                          </button>
                        </div>
                        <input
                          type="text"
                          name="assignment"
                          placeholder="What were they supposed to do on this play?"
                          style={{ marginTop: 7 }}
                        />
                      </form>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Coaching notes on this play. */}
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">Coaching notes</span>
                </div>
                <div className="panel-body stack">
                  {currentNotes.length === 0 ? (
                    <p className="tiny faint" style={{ margin: 0 }}>
                      No notes on this play.
                    </p>
                  ) : (
                    currentNotes.map((note) => {
                      const player = playerById.get(note.player_id);
                      return (
                        <div
                          key={note.id}
                          style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}
                        >
                          <div className="row between">
                            <strong className="tiny">
                              {player === undefined ? "Player" : playerLabel(player)}
                            </strong>
                            {note.visible_to_athlete ? (
                              <span className="badge accent">Athlete can see this</span>
                            ) : (
                              <span className="tiny faint">Coaches only</span>
                            )}
                          </div>
                          <div className="small">{note.body}</div>
                        </div>
                      );
                    })
                  )}

                  {canGrade && currentParticipation.length > 0 ? (
                    <form
                      action={(fd) => {
                        fd.set("play_id", current.id);
                        fd.set("film_id", filmId);
                        fd.set(
                          "timestamp_seconds",
                          String(Math.round(time * 1000) / 1000),
                        );
                        run(() => addNote(fd));
                      }}
                      style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
                    >
                      <select name="player_id" required style={{ marginBottom: 7 }}>
                        <option value="">Note about&hellip;</option>
                        {currentParticipation.map((participant) => {
                          const player = playerById.get(participant.player_id);
                          return player === undefined ? null : (
                            <option key={participant.id} value={player.id}>
                              {playerLabel(player)}
                            </option>
                          );
                        })}
                      </select>
                      <textarea
                        name="body"
                        required
                        placeholder="Good initial read. Maintain outside leverage longer."
                        style={{ minHeight: 60 }}
                      />
                      <label className="row tiny" style={{ margin: "7px 0" }}>
                        <input
                          type="checkbox"
                          name="visible_to_athlete"
                          style={{ width: "auto" }}
                        />
                        Share this note with the athlete
                      </label>
                      <button className="btn sm" type="submit" disabled={pending}>
                        Save note
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>

              {/* Clip creation from the current play. */}
              {props.canClip ? (
                <div className="panel">
                  <div className="panel-head">
                    <span className="panel-title">Create clip</span>
                  </div>
                  <div className="panel-body">
                    <form
                      action={(fd) => {
                        fd.set("film_id", filmId);
                        fd.set("play_id", current.id);
                        fd.set("start_seconds", String(current.start_seconds));
                        fd.set("end_seconds", String(current.end_seconds));
                        run(() => createClip(fd));
                      }}
                    >
                      <input
                        type="text"
                        name="title"
                        required
                        placeholder="Great leverage &mdash; #24"
                        style={{ marginBottom: 7 }}
                      />
                      <div className="row">
                        <select name="playback_rate" style={{ width: 110 }}>
                          {PLAYBACK_RATES.map((value) => (
                            <option key={value} value={value}>
                              {value}x
                            </option>
                          ))}
                        </select>
                        <button className="btn sm" type="submit" disabled={pending}>
                          Save clip
                        </button>
                      </div>
                      <p className="tiny faint" style={{ margin: "7px 0 0" }}>
                        Trimmed to play {current.play_number}:{" "}
                        {timecode(current.start_seconds)}
                        &ndash;{timecode(current.end_seconds)}.
                      </p>
                    </form>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Read-only view of a play's tags, for anyone who cannot tag. */
function ReadOnlyTags({ play }: { play: PlayRow }) {
  const fields: [string, string | number | null][] = [
    ["Personnel", play.personnel],
    ["Formation", play.formation],
    ["Concept", play.concept],
    ["Front", play.defensive_front],
    ["Coverage", play.coverage],
    ["Pressure", play.pressure],
    ["Result", play.result],
    ["Yards", play.yards],
  ];
  return (
    <dl style={{ margin: 0 }}>
      {fields.map(([label, value]) => (
        <div key={label} className="row between" style={{ padding: "3px 0" }}>
          <dt className="tiny faint">{label}</dt>
          <dd style={{ margin: 0 }} className="small">
            {value === null || value === "" ? (
              <span className="faint">not tagged</span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The tagging form.
 *
 * Every field is a datalist, not a closed select: the canonical vocabulary is
 * offered, and a coach can still type "Stretch" because that is what their
 * program calls it. A tagging screen that rejects a coach's own words is a
 * tagging screen they stop using.
 */
function TagForm({
  play,
  filmId,
  level,
  onResult,
}: {
  play: PlayRow;
  filmId: string;
  level: string;
  onResult: (result: ActionResult) => void;
}) {
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) => {
        fd.set("play_id", play.id);
        fd.set("film_id", filmId);
        fd.set("level", level);
        start(async () => {
          onResult(await tagPlay(fd));
        });
      }}
    >
      <datalist id="formations">
        {FORMATIONS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <datalist id="concepts">
        {[...RUN_CONCEPTS, ...PASS_CONCEPTS].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="coverages">
        {COVERAGES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="fronts">
        {DEFENSIVE_FRONTS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <datalist id="pressures">
        {PRESSURES.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <datalist id="personnel">
        {PERSONNEL_PACKAGES.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Down</span>
          <input
            type="number"
            name="down"
            min={1}
            max={4}
            defaultValue={play.down ?? ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Distance</span>
          <input
            type="number"
            name="distance"
            min={0}
            max={99}
            defaultValue={play.distance ?? ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Yard line (0&ndash;100)</span>
          <input
            type="number"
            name="yard_line"
            min={0}
            max={100}
            defaultValue={play.yard_line ?? ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Quarter</span>
          <input
            type="number"
            name="quarter"
            min={1}
            max={8}
            defaultValue={play.quarter ?? ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Our unit</span>
          <select name="possession" defaultValue={play.possession ?? ""}>
            <option value="">Not tagged</option>
            <option value="offense">Offense</option>
            <option value="defense">Defense</option>
            <option value="special_teams">Special teams</option>
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Run / pass</span>
          <select name="family" defaultValue={play.family ?? ""}>
            <option value="">Not tagged</option>
            <option value="run">Run</option>
            <option value="pass">Pass</option>
            <option value="special_teams">Special teams</option>
            <option value="penalty_only">Penalty only</option>
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Personnel</span>
          <input
            type="text"
            name="personnel"
            list="personnel"
            defaultValue={play.personnel ?? ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Formation</span>
          <input
            type="text"
            name="formation"
            list="formations"
            defaultValue={play.formation ?? ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Concept</span>
          <input
            type="text"
            name="concept"
            list="concepts"
            defaultValue={play.concept ?? ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Direction</span>
          <select name="direction" defaultValue={play.direction ?? ""}>
            <option value="">Not tagged</option>
            <option value="left">Left</option>
            <option value="middle">Middle</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Front</span>
          <input
            type="text"
            name="defensive_front"
            list="fronts"
            defaultValue={play.defensive_front ?? ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Coverage</span>
          <input
            type="text"
            name="coverage"
            list="coverages"
            defaultValue={play.coverage ?? ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Pressure</span>
          <input
            type="text"
            name="pressure"
            list="pressures"
            defaultValue={play.pressure ?? ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Yards</span>
          <input
            type="number"
            name="yards"
            min={-99}
            max={99}
            defaultValue={play.yards ?? ""}
          />
        </label>
      </div>

      <label className="field" style={{ marginTop: 8 }}>
        <span className="field-label">Result</span>
        <input
          type="text"
          name="result"
          defaultValue={play.result ?? ""}
          placeholder="+6 yards"
        />
      </label>

      <div className="row tiny" style={{ marginBottom: 10 }}>
        <label className="row tiny">
          <input
            type="checkbox"
            name="touchdown"
            defaultChecked={play.touchdown}
            style={{ width: "auto" }}
          />
          TD
        </label>
        <label className="row tiny">
          <input
            type="checkbox"
            name="first_down"
            defaultChecked={play.first_down}
            style={{ width: "auto" }}
          />
          1st down
        </label>
        <label className="row tiny">
          <input
            type="checkbox"
            name="turnover"
            defaultChecked={play.turnover}
            style={{ width: "auto" }}
          />
          Turnover
        </label>
        <label className="row tiny">
          <input
            type="checkbox"
            name="penalty"
            defaultChecked={play.penalty}
            style={{ width: "auto" }}
          />
          Penalty
        </label>
      </div>

      <p className="tiny faint" style={{ margin: "0 0 8px" }}>
        Explosive, red zone, third down and goal line are worked out from the down,
        distance, yard line and result &mdash; by the same shared rules every part of
        the platform uses. They are not typed in, so two screens cannot disagree about
        them.
      </p>

      <button className="btn primary sm" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save tags"}
      </button>
    </form>
  );
}
