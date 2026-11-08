"use client";

import { text } from "@hl-bos/tms";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveFleet } from "@/lib/client.ts";

const FIELDS = [
  "name",
  "type",
  "tankConfig",
  "year",
  "make",
  "model",
  "vin",
  "plate",
  "registrationExpires",
] as const;

export function VehicleEditor({ unit }: { unit: Record<string, unknown> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((k) => [k, text(unit[k], "")])),
  );
  const [inactive, setInactive] = useState(unit["status"] === "Inactive");
  const [msg, setMsg] = useState("");
  if (!open)
    return (
      <button
        className="mt-3 text-sm text-brand underline"
        onClick={() => setOpen(true)}
      >
        Edit profile
      </button>
    );
  return (
    <form
      className="mt-3 grid grid-cols-2 gap-2 text-sm"
      onSubmit={(e) =>
        void (async () => {
          e.preventDefault();
          setMsg("");
          try {
            await saveFleet((f) => {
              const i = f.assets.findIndex((x) => x.id === unit["id"]);
              const next: Record<string, unknown> = {
                ...f.assets[i],
                ...v,
                status: inactive ? "Inactive" : "Available",
              };
              if (v["year"]) next["year"] = Number(v["year"]);
              f.assets[i] = next;
            });
            setOpen(false);
            router.refresh();
          } catch (err) {
            setMsg((err as Error).message);
          }
        })()
      }
    >
      {FIELDS.map((k) => (
        <label key={k} className="flex flex-col">
          <span className="text-muted">{k}</span>
          <input
            className="rounded border border-line px-2 py-1"
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
          />
        </label>
      ))}
      <label className="col-span-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={inactive}
          onChange={(e) => setInactive(e.target.checked)}
        />{" "}
        Inactive (parked / retired)
      </label>
      <div className="col-span-2 flex gap-2">
        <button className="rounded bg-brand px-3 py-1 text-white">Save</button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-line px-3 py-1"
        >
          Cancel
        </button>
      </div>
      {msg ? <p className="col-span-2 text-bad">{msg}</p> : null}
    </form>
  );
}
