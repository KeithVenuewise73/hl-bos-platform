"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { type Workspace, WORKSPACE_VERSION } from "./store.ts";
import { buildSeed } from "./seed.ts";

const STORAGE_KEY = "hl-bti-alpha-workspace";

interface WorkspaceContextValue {
  ws: Workspace;
  /** Apply a mutation to a draft copy and persist the result. */
  update: (fn: (draft: Workspace) => void) => void;
  reset: () => void;
  ready: boolean;
}

const Ctx = createContext<WorkspaceContextValue | null>(null);

function load(): Workspace {
  if (typeof window === "undefined") return buildSeed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildSeed();
    const parsed = JSON.parse(raw) as Workspace;
    if (parsed.version !== WORKSPACE_VERSION) return buildSeed();
    return parsed;
  } catch {
    return buildSeed();
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [ws, setWs] = useState<Workspace>(() => buildSeed());
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage after mount (static export = client only).
  useEffect(() => {
    setWs(load());
    setReady(true);
  }, []);

  const persist = useCallback((next: Workspace) => {
    setWs(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  }, []);

  const update = useCallback((fn: (draft: Workspace) => void) => {
    setWs((current) => {
      const draft = structuredClone(current);
      fn(draft);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      }
      return draft;
    });
  }, []);

  const reset = useCallback(() => {
    persist(buildSeed());
  }, [persist]);

  return <Ctx.Provider value={{ ws, update, reset, ready }}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return v;
}
