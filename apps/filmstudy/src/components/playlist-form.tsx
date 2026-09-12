"use client";

import { useState, useTransition } from "react";
import { createPlaylist, type ActionResult } from "@/app/actions";

export function PlaylistForm({ teamId }: { teamId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form
      action={(fd) => {
        fd.set("team_id", teamId);
        start(async () => setResult(await createPlaylist(fd)));
      }}
    >
      <div className="row">
        <input
          type="text"
          name="name"
          required
          placeholder="Third Down Defense"
          disabled={pending}
          style={{ flex: 1 }}
        />
        <button className="btn primary" type="submit" disabled={pending}>
          Create
        </button>
      </div>
      <input
        type="text"
        name="description"
        placeholder="What this collection is for"
        disabled={pending}
        style={{ marginTop: 8 }}
      />
      <label className="row tiny" style={{ marginTop: 8 }}>
        <input type="checkbox" name="shared_with_athletes" style={{ width: "auto" }} />
        Share with the squad
      </label>
      {result !== null ? (
        <div
          className={result.ok ? "notice accent" : "notice bad"}
          style={{ marginTop: 12 }}
        >
          {result.message}
        </div>
      ) : null}
    </form>
  );
}
