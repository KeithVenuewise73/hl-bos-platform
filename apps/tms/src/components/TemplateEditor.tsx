"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fleetCall } from "@/lib/client.ts";

/**
 * Inspection templates: extra REQUIRED checklist items for an equipment type,
 * on top of the 11 base items (and 5 tank items for tankers), which cannot be
 * removed. Enforced by the database when a driver submits.
 */
export function TemplateEditor({
  templates,
  types,
}: {
  templates: { equipmentType: string; items: string[] }[];
  types: string[];
}) {
  const router = useRouter();
  const [type, setType] = useState(types[0] ?? "");
  const current = templates.find((t) => t.equipmentType === type)?.items ?? [];
  const [items, setItems] = useState(current.join("\n"));
  const [msg, setMsg] = useState("");
  return (
    <section className="rounded-lg border border-line bg-panel p-4 text-sm md:col-span-2">
      <h2 className="mb-1 font-semibold">Inspection templates</h2>
      <p className="mb-2 text-xs text-muted">
        Extra required items for one equipment type, one per line (up to 14). The
        standard items always stay on the list.
      </p>
      <ul data-testid="templates" className="mb-2 text-xs">
        {templates.map((t) => (
          <li key={t.equipmentType} data-template={t.equipmentType}>
            <b>{t.equipmentType}</b>: {t.items.join(" · ")}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-start gap-2">
        <select
          data-testid="template-type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setItems(
              (
                templates.find((t) => t.equipmentType === e.target.value)?.items ?? []
              ).join("\n"),
            );
          }}
          className="rounded border border-line px-2 py-1"
        >
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <textarea
          data-testid="template-items"
          rows={3}
          value={items}
          onChange={(e) => setItems(e.target.value)}
          className="min-w-64 flex-1 rounded border border-line px-2 py-1"
        />
        <button
          data-testid="template-save"
          className="rounded bg-brand px-3 py-1 text-white"
          onClick={() =>
            void fleetCall("save_template", {
              equipmentType: type,
              items: items
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean),
            })
              .then(() => {
                setMsg("Saved.");
                router.refresh();
              })
              .catch((e: Error) => setMsg(e.message))
          }
        >
          Save
        </button>
      </div>
      {msg ? (
        <p data-testid="template-msg" className="mt-1 text-xs">
          {msg}
        </p>
      ) : null}
    </section>
  );
}
