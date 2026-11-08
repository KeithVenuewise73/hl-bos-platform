"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLES, type Role } from "@hl-bos/tms";
import { fleetCall, saveFleet } from "@/lib/client.ts";

interface U {
  id: string;
  name: string;
  type: string;
  tankConfig: string;
}
interface M {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  units: string[];
}

export function SetupForms({
  units,
  members,
  isOwner,
}: {
  units: U[];
  members: M[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [nu, setNu] = useState({
    id: "",
    name: "",
    type: "Box truck",
    tankConfig: "Not applicable",
  });
  const [msg, setMsg] = useState("");
  const run = async (f: () => Promise<unknown>) => {
    setMsg("");
    try {
      await f();
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-lg border border-line bg-panel p-4 text-sm">
        <h2 className="mb-2 font-semibold">Vehicles</h2>
        <ul data-testid="registry" className="mb-3 space-y-1">
          {units.map((u) => (
            <li key={u.id} data-reg={u.id} className="flex justify-between">
              <span>
                <b>{u.id}</b> {u.name}{" "}
                <span className="text-muted">
                  · {u.type}
                  {u.tankConfig && u.tankConfig !== "Not applicable"
                    ? ` · ${u.tankConfig}`
                    : ""}
                </span>
              </span>
              <button
                className="text-xs text-bad underline"
                onClick={() =>
                  void run(() =>
                    saveFleet((f) => {
                      f.assets = f.assets.filter((a) => a.id !== u.id);
                    }),
                  )
                }
              >
                remove
              </button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <input
            data-testid="unit-id"
            placeholder="Unit ID (e.g. T-105)"
            value={nu.id}
            onChange={(e) => setNu({ ...nu, id: e.target.value })}
            className="rounded border border-line px-2 py-1"
          />
          <input
            data-testid="unit-name"
            placeholder="Name"
            value={nu.name}
            onChange={(e) => setNu({ ...nu, name: e.target.value })}
            className="rounded border border-line px-2 py-1"
          />
          <select
            data-testid="unit-type"
            value={nu.type}
            onChange={(e) =>
              setNu({
                ...nu,
                type: e.target.value,
                tankConfig:
                  e.target.value === "Tanker" ? "1 compartment" : "Not applicable",
              })
            }
            className="rounded border border-line px-2 py-1"
          >
            {[
              "Tanker",
              "Box truck",
              "Flatbed",
              "Tractor",
              "Pickup",
              "Van",
              "Trailer",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            placeholder="Tank configuration"
            value={nu.tankConfig}
            onChange={(e) => setNu({ ...nu, tankConfig: e.target.value })}
            className="rounded border border-line px-2 py-1"
          />
        </div>
        <button
          data-testid="unit-add"
          disabled={!/^[A-Za-z0-9_-]{1,80}$/.test(nu.id)}
          className="mt-2 rounded bg-brand px-3 py-1 text-white disabled:opacity-40"
          onClick={() =>
            void run(async () => {
              await saveFleet((f) => {
                f.assets.push({ ...nu, name: nu.name || nu.id, status: "Available" });
              });
              setNu({
                id: "",
                name: "",
                type: "Box truck",
                tankConfig: "Not applicable",
              });
            })
          }
        >
          Add vehicle
        </button>
        <p className="mt-1 text-xs text-muted">
          A vehicle with inspections or records cannot be removed; mark it Inactive
          instead.
        </p>
      </section>
      <section className="rounded-lg border border-line bg-panel p-4 text-sm">
        <h2 className="mb-2 font-semibold">People and vehicle assignments</h2>
        {!isOwner ? (
          <p className="mb-2 text-xs text-muted">
            Only the company owner can change roles and assignments.
          </p>
        ) : null}
        <ul className="space-y-3">
          {members.map((m) => (
            <MemberRow key={m.id} m={m} units={units} disabled={!isOwner} run={run} />
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Inviting new people needs HL-BOS accounts (each person verifies an e-mail).
          Not available in this demo.
        </p>
      </section>
      {msg ? (
        <p data-testid="setup-error" className="text-bad md:col-span-2">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

function MemberRow({
  m,
  units,
  disabled,
  run,
}: {
  m: M;
  units: U[];
  disabled: boolean;
  run: (f: () => Promise<unknown>) => Promise<void>;
}) {
  const [role, setRole] = useState<Role>(m.role);
  const [assigned, setAssigned] = useState<string[]>(m.units);
  return (
    <li data-member={m.email}>
      <div className="flex items-center justify-between">
        <b>{m.name}</b>
        <span className="text-xs text-muted">{m.email}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <select
          disabled={disabled}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded border border-line px-2 py-1"
        >
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        {role === "driver"
          ? units.map((u) => (
              <label key={u.id} className="flex items-center gap-1 text-xs">
                <input
                  data-assign={`${m.email}:${u.id}`}
                  type="checkbox"
                  disabled={disabled}
                  checked={assigned.includes(u.id)}
                  onChange={(e) =>
                    setAssigned(
                      e.target.checked
                        ? [...assigned, u.id]
                        : assigned.filter((x) => x !== u.id),
                    )
                  }
                />
                {u.id}
              </label>
            ))
          : null}
        {!disabled ? (
          <button
            data-save-member={m.email}
            className="rounded border border-line px-2 py-1 text-xs"
            onClick={() =>
              void run(() =>
                fleetCall("save_member", {
                  email: m.email,
                  role,
                  active: true,
                  units: role === "driver" ? assigned : [],
                }),
              )
            }
          >
            Save
          </button>
        ) : null}
      </div>
    </li>
  );
}
