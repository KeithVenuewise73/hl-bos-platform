"use client";

import { text } from "@hl-bos/tms";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveFleet } from "@/lib/client.ts";

const FIELDS = [
  ["name", "Full name", "text"],
  ["email", "Sign-in e-mail", "email"],
  ["licenseClass", "Licence class", "text"],
  ["endorsements", "Endorsements", "text"],
  ["cdlExpires", "CDL expires", "date"],
  ["medicalExpires", "Medical card expires", "date"],
  ["hired", "Hired", "date"],
] as const;

export function DriverProfileForm({
  existing,
}: {
  existing?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map(([k]) => [k, text(existing?.[k], "")])),
  );
  const [msg, setMsg] = useState("");
  return (
    <form
      className="grid grid-cols-2 gap-2 text-sm"
      onSubmit={(e) =>
        void (async () => {
          e.preventDefault();
          setMsg("");
          try {
            await saveFleet((f) => {
              const id = existing
                ? text(existing["id"])
                : v["name"]!.toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "") || `driver-${Date.now()}`;
              const next = { ...(existing ?? {}), ...v, id };
              const i = f.drivers.findIndex((x) => x.id === id);
              if (i >= 0) f.drivers[i] = next;
              else f.drivers.push(next);
            });
            if (!existing) setV(Object.fromEntries(FIELDS.map(([k]) => [k, ""])));
            router.refresh();
          } catch (err) {
            setMsg((err as Error).message);
          }
        })()
      }
    >
      {FIELDS.map(([k, label, type]) => (
        <label key={k} className="flex flex-col">
          <span className="text-muted">{label}</span>
          <input
            data-field={k}
            type={type}
            className="rounded border border-line px-2 py-1"
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
          />
        </label>
      ))}
      <div className="col-span-2">
        <button
          data-testid="driver-save"
          disabled={!v["name"]?.trim()}
          className="rounded bg-brand px-3 py-1 text-white disabled:opacity-40"
        >
          {existing ? "Save changes" : "Add driver"}
        </button>
      </div>
      {msg ? <p className="col-span-2 text-bad">{msg}</p> : null}
    </form>
  );
}
