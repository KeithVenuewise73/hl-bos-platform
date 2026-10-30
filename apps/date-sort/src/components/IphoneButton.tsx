"use client";

import { useEffect, useState } from "react";

import { count } from "@/lib/format.ts";
import type { IphoneLine } from "@/lib/iphone-script.ts";

interface Tally {
  device: string;
  total: number;
  done: number;
  copied: number;
  already: number;
  conflicts: number;
  /** Already in the folder but smaller than on the phone: cut short earlier. */
  short: string[];
  failed: string[];
}

type State =
  | { readonly kind: "idle" }
  | {
      readonly kind: "copying";
      readonly tally: Tally | null;
      /** While the phone is being listed: the folder, and files found so far. */
      readonly looking?: { readonly folder: string; readonly sofar: number };
    }
  | { readonly kind: "done"; readonly tally: Tally }
  | { readonly kind: "problem"; readonly message: string; readonly detail?: string };

/**
 * "Bring in from iPhone": copies the plugged-in iPhone's photos and videos
 * into a folder kept for them (chosen once, remembered), skipping what is
 * already there, then scans that folder. The phone is only read.
 */
export function IphoneButton({
  disabled,
  onReady,
}: {
  disabled: boolean;
  /** The folder now holds the phone's photos: scan it. */
  onReady: (folder: string) => void;
}) {
  const [folder, setFolder] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    void fetch("/api/settings", { headers: { "Content-Type": "application/json" } })
      .then((r) => r.json())
      .then((s: { iphoneFolder?: string | null }) => setFolder(s.iphoneFolder ?? null))
      .catch(() => undefined);
  }, []);

  async function chooseFolder(): Promise<string | null> {
    const res = await fetch("/api/browse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "iphone" }),
    }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as {
      kind?: string;
      path?: string;
      reason?: string;
    };
    if (out.kind === "picked" && out.path) {
      setFolder(out.path);
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iphoneFolder: out.path }),
      }).catch(() => undefined);
      return out.path;
    }
    if (out.kind !== "cancelled") {
      setState({
        kind: "problem",
        message: out.reason ?? "The folder window could not be opened.",
      });
    }
    return null;
  }

  async function bringIn() {
    const into = folder ?? (await chooseFolder());
    if (into === null) return;
    setState({ kind: "copying", tally: null });
    let tally: Tally | null = null;
    let ended = false;
    try {
      const res = await fetch("/api/iphone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: into }),
      });
      if (!res.ok || res.body === null) {
        const out = (await res.json().catch(() => ({}))) as { error?: string };
        setState({
          kind: "problem",
          message: out.error ?? "The iPhone could not be read.",
        });
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
          const m = JSON.parse(line) as IphoneLine;
          if (m.type === "none") {
            ended = true;
            setState({
              kind: "problem",
              message:
                "No iPhone found. Plug it in with its cable, unlock it, and tap Trust if it asks, then press the button again.",
            });
          } else if (m.type === "locked") {
            ended = true;
            setState({
              kind: "problem",
              message: `${m.device} is connected but its photos can't be seen yet. Unlock it and tap Trust (then enter its passcode), then press the button again.`,
              ...(m.seen
                ? { detail: `What Windows sees inside the phone: ${m.seen}` }
                : {}),
            });
          } else if (m.type === "looking") {
            setState({
              kind: "copying",
              tally: null,
              looking: { folder: m.folder, sofar: m.sofar },
            });
          } else if (m.type === "error") {
            ended = true;
            setState({ kind: "problem", message: m.message });
          } else if (m.type === "found") {
            tally = {
              device: m.device,
              total: m.total,
              done: 0,
              copied: 0,
              already: 0,
              conflicts: 0,
              short: [],
              failed: [],
            };
            setState({ kind: "copying", tally: { ...tally } });
          } else if (m.type === "file" && tally !== null) {
            tally.done += 1;
            if (m.result === "copied") tally.copied += 1;
            else if (m.result === "already") tally.already += 1;
            else if (m.result === "conflict") tally.conflicts += 1;
            else if (m.result === "short") tally.short.push(`${m.folder}\\${m.name}`);
            else tally.failed.push(`${m.folder}\\${m.name}`);
            setState({
              kind: "copying",
              tally: { ...tally, short: [...tally.short], failed: [...tally.failed] },
            });
          } else if (m.type === "stuck") {
            ended = true;
            setState({
              kind: "problem",
              message: `The iPhone stopped answering after ${tally !== null ? `${tally.copied.toLocaleString("en-US")} files were copied and ` : ""}several files in a row could not be read. Unplug it, plug it back in and unlock it, then press the button again. What is copied is kept; the files that failed are tried last next time.`,
            });
          } else if (m.type === "done" && tally !== null) {
            ended = true;
            setState({ kind: "done", tally });
            onReady(into);
          }
        }
      }
      if (!ended) {
        setState({
          kind: "problem",
          message:
            "Copying from the iPhone stopped part-way (was it unplugged or locked?). Everything copied so far is complete; press the button again to finish the rest.",
        });
      }
    } catch {
      setState({
        kind: "problem",
        message:
          "DateSort lost touch with this page. Press the button again; what is already copied is skipped.",
      });
    }
  }

  const busy = state.kind === "copying";
  const t = state.kind === "copying" || state.kind === "done" ? state.tally : null;
  return (
    <div className="space-y-2 border-t border-line pt-3" data-testid="iphone">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          data-testid="iphone-button"
          disabled={disabled || busy}
          onClick={() => void bringIn()}
        >
          {busy ? "Copying from the iPhone…" : "Bring in from iPhone"}
        </button>
        <span className="text-xs text-muted" data-testid="iphone-folder">
          {folder === null ? (
            "Plug in and unlock the iPhone first. You'll choose where its photos and videos are kept."
          ) : (
            <>
              Kept in <span className="font-mono">{folder}</span> ·{" "}
              <button
                type="button"
                className="underline"
                disabled={busy}
                onClick={() => void chooseFolder()}
              >
                change
              </button>
            </>
          )}
        </span>
      </div>
      {busy && t === null ? (
        <p className="text-sm" data-testid="iphone-looking">
          {state.looking
            ? `Reading the iPhone's ${state.looking.folder} folder… ${count(state.looking.sofar, "file")} found so far. A full phone takes a few minutes.`
            : "Looking for the iPhone…"}
        </p>
      ) : null}
      {t !== null ? (
        <p className="text-sm" data-testid="iphone-progress">
          {state.kind === "done" ? "Done: " : `Copying from ${t.device}: `}
          {t.done.toLocaleString("en-US")} of {count(t.total, "file")} ·{" "}
          {t.copied.toLocaleString("en-US")} copied ·{" "}
          {t.already.toLocaleString("en-US")} already there
          {t.conflicts > 0
            ? ` · ${t.conflicts} with the same name as a different file (left alone)`
            : ""}
          {t.failed.length > 0
            ? ` · ${t.failed.length} could not be copied this time (${t.failed.slice(0, 3).join(", ")}${t.failed.length > 3 ? "…" : ""}); press the button again to retry them`
            : ""}
          {t.short.length > 0
            ? ` · ${t.short.length} already in the folder but smaller than on the phone, probably cut short by an earlier copy (${t.short.slice(0, 3).join(", ")}${t.short.length > 3 ? "…" : ""})`
            : ""}
          {state.kind === "done" ? ". Scanning them now." : ""}
        </p>
      ) : null}
      {state.kind === "problem" ? (
        <p className="text-sm text-estimate" data-testid="iphone-problem">
          {state.message}
        </p>
      ) : null}
      {state.kind === "problem" && state.detail ? (
        <p className="font-mono text-xs text-muted" data-testid="iphone-detail">
          {state.detail}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        Only copies: nothing on the iPhone is moved, changed or deleted. Once you have
        checked the photos are in their folders, delete them on the phone yourself.
      </p>
    </div>
  );
}
