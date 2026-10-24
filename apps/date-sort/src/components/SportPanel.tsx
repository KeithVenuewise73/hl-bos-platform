"use client";

import { useEffect, useRef, useState } from "react";

import { SPORT_LABEL, type SportGuess, withSport } from "@hl-bos/date-sort/sport-rules";

import type { CopyState } from "@/components/CopyPanel.tsx";
import { count } from "@/lib/format.ts";
import type { ScanView, SportMessage } from "@/lib/scan-view.ts";

/** Sport suggestions: the Claude key, the Suggest button, and each date's answer. */
export function useSport(view: ScanView) {
  const [keySaved, setKeySaved] = useState<boolean | null>(null);
  const [guesses, setGuesses] = useState<Record<string, SportGuess>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void fetch("/api/claude-key", { headers: { "Content-Type": "application/json" } })
      .then((r) => r.json())
      .then((out: { saved?: boolean }) => setKeySaved(out.saved === true))
      .catch(() => setKeySaved(false));
  }, []);

  async function saveKey(key: string): Promise<string | null> {
    const res = await fetch("/api/claude-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }).catch(() => null);
    if (res === null) return "DateSort did not answer. Is its window still open?";
    const out = (await res.json().catch(() => ({}))) as {
      saved?: boolean;
      error?: string;
    };
    if (out.saved === true) {
      setKeySaved(true);
      return null;
    }
    return out.error ?? "The key could not be saved.";
  }

  async function removeKey() {
    await fetch("/api/claude-key", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }).catch(() => undefined);
    setKeySaved(false);
  }

  async function suggest() {
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError(null);
    setFailed({});
    try {
      const res = await fetch("/api/sport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId: view.scanId }),
        signal: controller.signal,
      });
      if (!res.ok || res.body === null) {
        const out = (await res.json().catch(() => ({}))) as { error?: string };
        setError(out.error ?? "Claude could not be asked.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffered.indexOf("\n")) !== -1) {
          const line = buffered.slice(0, nl);
          buffered = buffered.slice(nl + 1);
          if (line.trim() === "") continue;
          const m = JSON.parse(line) as SportMessage;
          if (m.type === "guess") setGuesses((g) => ({ ...g, [m.guess.day]: m.guess }));
          else if (m.type === "failed")
            setFailed((f) => ({ ...f, [m.day]: m.message }));
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        setError(
          "DateSort lost touch with this page while asking Claude. Press the button again; dates already answered are not asked twice.",
        );
      }
    } finally {
      setRunning(false);
    }
  }

  return {
    keySaved,
    saveKey,
    removeKey,
    suggest,
    stop: () => abort.current?.abort(),
    running,
    guesses,
    failed,
    error,
  };
}

export type SportState = ReturnType<typeof useSport>;

export function SportPanel({
  view,
  sport,
  copy,
}: {
  view: ScanView;
  sport: SportState;
  copy: CopyState;
}) {
  const [key, setKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);
  const total = view.report.days.length;
  const answered = Object.keys(sport.guesses).length;
  const suggested = Object.values(sport.guesses).filter((g) => g.sport !== null);
  const toApply = suggested.filter(
    (g) =>
      withSport(copy.names[g.day] ?? "", g.sport!) !== (copy.names[g.day] ?? "").trim(),
  );

  return (
    <section className="card space-y-3 p-5" data-testid="sport-panel">
      <div>
        <h2 className="display text-lg">Sports</h2>
        <p className="text-sm text-muted">
          Claude looks at about 8 photos from each date and says which sport it shows.
          Only small copies of those photos are sent to Anthropic (768 px, with no
          location or camera details). Nothing else leaves this laptop, and nothing is
          renamed until you choose to use a suggestion.
        </p>
      </div>

      {sport.keySaved === false ? (
        <form
          className="space-y-2"
          data-testid="claude-key-form"
          onSubmit={(e) => {
            e.preventDefault();
            setChecking(true);
            setKeyError(null);
            void sport.saveKey(key).then((problem) => {
              setChecking(false);
              setKeyError(problem);
              if (problem === null) setKey("");
            });
          }}
        >
          <label className="block text-sm" htmlFor="claude-key">
            To turn this on, paste your Claude API key (from the Anthropic Console,
            under API Keys). DateSort remembers it on this laptop only.
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="claude-key"
              data-testid="claude-key-input"
              type="password"
              autoComplete="off"
              className="input font-mono"
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button
              type="submit"
              className="btn-primary shrink-0"
              data-testid="claude-key-save"
              disabled={checking || key.trim() === ""}
            >
              {checking ? "Checking with Anthropic…" : "Save key"}
            </button>
          </div>
          {keyError !== null ? (
            <p className="text-sm text-bad" data-testid="claude-key-error">
              {keyError}
            </p>
          ) : null}
        </form>
      ) : null}

      {sport.keySaved === true ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {answered > 0
                ? `${count(answered, "date")} of ${total} answered · ${suggested.length} with a clear sport`
                : `${count(total, "date")} to ask about`}
            </p>
            <div className="flex flex-wrap gap-2">
              {sport.running ? (
                <button type="button" className="btn-ghost" onClick={sport.stop}>
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="suggest-sports"
                  disabled={copy.running !== null}
                  onClick={() => {
                    setApplied(null);
                    void sport.suggest();
                  }}
                >
                  {answered > 0
                    ? "Ask again for missing dates"
                    : `Suggest sports for all ${count(total, "date")}`}
                </button>
              )}
              {toApply.length > 0 && !sport.running ? (
                <button
                  type="button"
                  className="btn-ghost"
                  data-testid="use-all-sports"
                  disabled={copy.running !== null}
                  onClick={() => {
                    const changes: Record<string, string> = {};
                    for (const g of toApply)
                      changes[g.day] = withSport(copy.names[g.day] ?? "", g.sport!);
                    copy.applyNames(changes);
                    setApplied(toApply.length);
                  }}
                >
                  Use all {toApply.length} suggestions
                </button>
              ) : null}
            </div>
          </div>
          {sport.running ? (
            <p className="text-sm" data-testid="sport-progress">
              Asking Claude… {answered} of {total} dates answered.
            </p>
          ) : null}
          {applied !== null ? (
            <p className="text-sm text-brand" data-testid="sports-applied">
              Sport added to {count(applied, "event name")}. Press Copy all below: date
              folders already copied are renamed to match, and no photo is copied twice.
            </p>
          ) : null}
          {sport.error !== null ? (
            <p className="text-sm text-bad">{sport.error}</p>
          ) : null}
          <button
            type="button"
            className="text-xs text-muted underline"
            onClick={() => void sport.removeKey()}
          >
            Remove the Claude key from this laptop
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** One date's answer, on its card. */
export function CardSport({
  day,
  sport,
  copy,
}: {
  day: string;
  sport: SportState;
  copy: CopyState;
}) {
  const guess = sport.guesses[day];
  const failure = sport.failed[day];
  if (failure !== undefined) {
    return (
      <p className="text-xs text-bad" data-testid="card-sport">
        Sport: {failure}
      </p>
    );
  }
  if (guess === undefined) return null;
  const name = copy.names[day] ?? "";
  if (guess.sport === null) {
    const tally = guess.tally
      .map(
        (t) =>
          `${t.verdict in SPORT_LABEL ? SPORT_LABEL[t.verdict as keyof typeof SPORT_LABEL] : t.verdict} ${t.count}`,
      )
      .join(", ");
    return (
      <p className="text-xs text-estimate" data-testid="card-sport">
        {guess.looked === 0
          ? guess.notes
          : `Sport not clear from ${count(guess.looked, "photo")} (${tally}). Type it in if you know it.`}
      </p>
    );
  }
  const label = SPORT_LABEL[guess.sport];
  const named = withSport(name, guess.sport) === name.trim();
  return (
    <div
      className="flex items-center justify-between gap-2 text-xs"
      data-testid="card-sport"
    >
      <span>
        Looks like <strong className="text-text">{label}</strong> ({guess.agreeing} of{" "}
        {count(guess.looked, "photo")})
      </span>
      {named ? (
        <span className="text-muted">in the name</span>
      ) : (
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          data-testid="use-sport"
          disabled={copy.running !== null}
          onClick={() => copy.applyNames({ [day]: withSport(name, guess.sport!) })}
        >
          Use
        </button>
      )}
    </div>
  );
}
