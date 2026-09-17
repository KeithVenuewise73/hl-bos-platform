"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { describeError } from "./api";

export interface Async<T> {
  data: T | null;
  loading: boolean;
  /** One sentence, already including the RPC's own message. Never swallowed. */
  error: string | null;
  reload: () => void;
}

/**
 * Load something from an RPC, once per change of `deps`.
 *
 * `error` is a string rather than a boolean on purpose: a refusal from the
 * database carries the reason (which capability has not shipped, which
 * permission is missing, which rule refused), and that reason is the only
 * useful thing to put on the screen. A screen that rendered "something went
 * wrong" would throw away the only part worth reading.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((v) => {
        if (live) setData(v);
      })
      .catch((e: unknown) => {
        if (live) {
          setData(null);
          setError(describeError(e));
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // `fn` is held in a ref rather than listed here on purpose: callers pass a
    // fresh closure on every render, so depending on it would re-fetch in a
    // loop. The caller's `deps` are the real inputs, and `nonce` is reload().
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

export interface Notice {
  kind: "good" | "bad";
  text: string;
}

/**
 * Run a write, and report what the database said either way.
 *
 * Nothing optimistic happens here: `busy` is true until the RPC returns, and a
 * success message is only produced by a call that actually succeeded. A button
 * that reported success before the round trip would be a control that does not
 * control anything.
 */
export function useAction(): {
  busy: boolean;
  notice: Notice | null;
  clear: () => void;
  run: (label: string, fn: () => Promise<unknown>, after?: () => void) => void;
} {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const run = useCallback(
    (label: string, fn: () => Promise<unknown>, after?: () => void) => {
      setBusy(true);
      setNotice(null);
      fn()
        .then(() => {
          setNotice({ kind: "good", text: label });
          after?.();
        })
        .catch((e: unknown) => setNotice({ kind: "bad", text: describeError(e) }))
        .finally(() => setBusy(false));
    },
    [],
  );

  return { busy, notice, clear: useCallback(() => setNotice(null), []), run };
}
