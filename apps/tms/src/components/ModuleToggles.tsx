"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Mod {
  key: string;
  number: number;
  name: string;
  release: number;
  summary: string;
  available: boolean;
  backend: string;
  ui: string;
  needs: string[];
}

export function ModuleToggles({
  licensed,
  modules,
}: {
  licensed: string[];
  modules: Mod[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(licensed);
  const [msg, setMsg] = useState("");
  const post = async (body: unknown) => {
    setMsg("");
    const res = await fetch("/api/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const b = (await res.json()) as { error?: string };
    if (!res.ok) setMsg(b.error ?? "Failed");
    router.refresh();
  };
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <ul className="divide-y divide-line">
        {modules.map((m) => (
          <li
            key={m.key}
            data-module={m.key}
            className="flex items-start gap-3 py-2 text-sm"
          >
            <input
              data-toggle={m.key}
              type="checkbox"
              disabled={!m.available}
              checked={sel.includes(m.key)}
              onChange={(e) =>
                setSel(
                  e.target.checked ? [...sel, m.key] : sel.filter((x) => x !== m.key),
                )
              }
              className="mt-1"
            />
            <div className="flex-1">
              <div>
                <b>
                  {m.number}. {m.name}
                </b>{" "}
                <span className="text-xs text-muted">Release {m.release}</span>
              </div>
              <div className="text-xs text-muted">{m.summary}</div>
              {m.needs.length ? (
                <div className="text-xs">Needs one of: {m.needs.join(", ")}</div>
              ) : null}
            </div>
            <span
              className={`whitespace-nowrap text-xs ${m.available ? "text-ok" : "text-muted"}`}
            >
              {m.available
                ? `built (${m.ui.toLowerCase().replace("_", " ")})`
                : "not built yet"}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          data-testid="save-modules"
          onClick={() => void post({ action: "license", modules: sel })}
          className="rounded bg-brand px-3 py-1 text-sm text-white"
        >
          Save licences
        </button>
        <button
          data-testid="reset-demo"
          onClick={() => {
            if (confirm("Reset all demo data for both companies?"))
              void post({ action: "reset" });
          }}
          className="rounded border border-line px-3 py-1 text-sm"
        >
          Reset demo data
        </button>
      </div>
      {msg ? <p className="mt-2 text-sm text-bad">{msg}</p> : null}
    </section>
  );
}
