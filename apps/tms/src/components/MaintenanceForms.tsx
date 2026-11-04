"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICE_CATEGORIES, newServiceId } from "@hl-bos/tms";
import { fleetCall, saveFleet } from "@/lib/client.ts";

export function MaintenanceForms({
  units,
  work,
  canManage,
  preset,
}: {
  units: string[];
  work: { id: string; asset: string; status: string }[];
  canManage: boolean;
  preset: { unit?: string; inspection?: string };
}) {
  const router = useRouter();
  const [asset, setAsset] = useState(
    preset.unit && units.includes(preset.unit) ? preset.unit : (units[0] ?? ""),
  );
  const [category, setCategory] = useState<string>("Repair");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState("");
  const [workId, setWorkId] = useState("");
  const [msg, setMsg] = useState("");
  const [woTitle, setWoTitle] = useState("");
  const [woAsset, setWoAsset] = useState(units[0] ?? "");

  async function addService() {
    setMsg("");
    try {
      await fleetCall("submit_service", {
        record: {
          id: newServiceId(),
          asset,
          category,
          title: title.trim(),
          date,
          costCents: String(Math.round(Number(cost || "0") * 100)),
          ...(workId ? { work: workId } : {}),
          ...(preset.inspection && preset.unit === asset
            ? { inspection: preset.inspection }
            : {}),
        },
      });
      setTitle("");
      setCost("");
      setWorkId("");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function addWorkOrder() {
    setMsg("");
    try {
      await saveFleet((f) => {
        f.work.push({
          id: `WO-${Date.now()}`,
          asset: woAsset,
          title: woTitle.trim(),
          status: "Open",
          cost: 0,
          opened: new Date().toISOString().slice(0, 10),
        });
      });
      setWoTitle("");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function completeWorkOrder(id: string) {
    setMsg("");
    try {
      await saveFleet((f) => {
        const w = f.work.find((x) => x.id === id);
        if (w) w.status = "Completed";
      });
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const done = work.filter((w) => w.status === "Completed" && w.asset === asset);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-lg border border-line bg-panel p-4 text-sm">
        <h2 className="mb-2 font-semibold">Record a service</h2>
        <div className="grid grid-cols-2 gap-2">
          <select
            data-testid="svc-unit"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="rounded border border-line px-2 py-1"
          >
            {units.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-line px-2 py-1"
          >
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            data-testid="svc-title"
            placeholder="What was done"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="col-span-2 rounded border border-line px-2 py-1"
            maxLength={160}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-line px-2 py-1"
          />
          <input
            data-testid="svc-cost"
            placeholder="Cost $"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ""))}
            className="rounded border border-line px-2 py-1"
          />
          <select
            value={workId}
            onChange={(e) => setWorkId(e.target.value)}
            className="col-span-2 rounded border border-line px-2 py-1"
          >
            <option value="">No work order</option>
            {done.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} (completed)
              </option>
            ))}
          </select>
        </div>
        <button
          data-testid="svc-save"
          disabled={!title.trim()}
          onClick={() => void addService()}
          className="mt-2 rounded bg-brand px-3 py-1 text-white disabled:opacity-40"
        >
          Save service record
        </button>
        <p className="mt-1 text-xs text-muted">
          Service records are signed and append-only; to correct one, void it (not built
          in this prototype).
        </p>
      </section>
      <section className="rounded-lg border border-line bg-panel p-4 text-sm">
        <h2 className="mb-2 font-semibold">Work orders</h2>
        {canManage ? (
          <>
            <div className="flex gap-2">
              <select
                value={woAsset}
                onChange={(e) => setWoAsset(e.target.value)}
                className="rounded border border-line px-2 py-1"
              >
                {units.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <input
                data-testid="wo-title"
                placeholder="Work to be done"
                value={woTitle}
                onChange={(e) => setWoTitle(e.target.value)}
                className="flex-1 rounded border border-line px-2 py-1"
              />
              <button
                data-testid="wo-add"
                disabled={!woTitle.trim()}
                onClick={() => void addWorkOrder()}
                className="rounded bg-brand px-3 py-1 text-white disabled:opacity-40"
              >
                Open
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {work
                .filter((w) => w.status !== "Completed")
                .map((w) => (
                  <li key={w.id}>
                    {w.id} · {w.asset}{" "}
                    <button
                      className="ml-2 text-brand underline"
                      onClick={() => void completeWorkOrder(w.id)}
                    >
                      mark completed
                    </button>
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <p className="text-muted">
            Opening and closing work orders needs an owner or manager (the production
            backend allows only those roles to save the fleet).
          </p>
        )}
      </section>
      {msg ? (
        <p data-testid="maint-error" className="text-bad md:col-span-2">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
