"use client";

import { useState } from "react";

import type { NeedChoice } from "@/app/api/review/route.ts";
import { CLOCK_HINT, choiceQuestion, gameLine } from "@/lib/game-choice.ts";
import type { GameAnswer } from "@/lib/send-day.ts";

/**
 * "Which game do these join?" The website already holds a game for this date under another
 * name. Nothing is chosen for the person and nothing is sent until they answer.
 */
export function GameChoice({
  need,
  disabled,
  onAnswer,
}: {
  need: NeedChoice;
  disabled?: boolean;
  onAnswer: (answer: GameAnswer) => void;
}) {
  const NEW = -1;
  const [pick, setPick] = useState<number | null>(need.games.length === 1 ? 0 : null);
  return (
    <fieldset
      className="space-y-2 text-xs"
      data-testid="game-choice"
      disabled={disabled}
    >
      <legend className="font-semibold">
        {choiceQuestion(need.day, need.typed, need.games)}
      </legend>
      {need.games.map((g, i) => (
        <label key={`${g.name}|${g.sport}`} className="flex items-start gap-2">
          <input
            type="radio"
            name={`game-${need.day}`}
            checked={pick === i}
            onChange={() => setPick(i)}
            data-testid="game-choice-existing"
          />
          <span>Add to: {gameLine(g)}</span>
        </label>
      ))}
      <label className="flex items-start gap-2">
        <input
          type="radio"
          name={`game-${need.day}`}
          checked={pick === NEW}
          onChange={() => setPick(NEW)}
          data-testid="game-choice-new"
        />
        <span>A different game: start a new one called &ldquo;{need.typed}&rdquo;</span>
      </label>
      <p className="text-muted" data-testid="game-choice-hint">
        {CLOCK_HINT}
      </p>
      <button
        type="button"
        className="btn-ghost w-full"
        data-testid="game-choice-send"
        disabled={pick === null}
        onClick={() => {
          if (pick === null) return;
          const g = need.games[pick];
          onAnswer(
            pick === NEW || g === undefined
              ? { asNew: true }
              : { join: { name: g.name, sport: g.sport } },
          );
        }}
      >
        Send for review
      </button>
    </fieldset>
  );
}
