"use client";

import { useState, useTransition } from "react";
import { ActionBar } from "./Actions";
import { analysePendingShops, importProspectList } from "@/app/shops/actions";
import type { ActionResult } from "@/app/actions";

/**
 * The two things the CEO can do on this page.
 *
 * "Look at the websites" is the one nothing else can do: it makes outbound
 * requests from THIS machine. It is the reason this page exists rather than a
 * server job.
 *
 * There is no "re-run everything" button. Re-auditing every shop on a whim
 * would point fifty requests at fifty small businesses for no new information,
 * and the analyses already stored are the ones that were sent. When re-auditing
 * over time becomes a real need, it gets a button that says what it costs.
 */
export function ShopActions({ fetchable }: { fetchable: number }) {
  return (
    <ActionBar
      actions={[
        {
          label:
            fetchable === 0
              ? "Look at the websites"
              : `Look at ${Math.min(fetchable, 10)} website${Math.min(fetchable, 10) === 1 ? "" : "s"}`,
          run: analysePendingShops,
          primary: fetchable > 0,
          hint:
            fetchable === 0
              ? "Every shop that has a website has already been looked at."
              : `${fetchable} shop${fetchable === 1 ? " has a website" : "s have websites"} nobody has opened yet. ` +
                "This visits them one at a time from this machine.",
        },
      ]}
    />
  );
}

/**
 * Importing a spreadsheet.
 *
 * The console asks for a path rather than uploading bytes: the file is already
 * on this machine, the script that reads it runs on this machine, and copying
 * it through a browser upload would add a step and a temporary file for no gain.
 */
export function ImportList() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "#21262d",
          color: "#e8eaed",
          border: "1px solid #30363d",
          borderRadius: 8,
          padding: "9px 14px",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Import a prospect list
      </button>
    );
  }

  return (
    <div>
      <form
        action={(fd) => {
          start(async () => setResult(await importProspectList(fd)));
        }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        <input
          name="path"
          placeholder="C:\Users\Keith\Documents\prospects.xlsx"
          style={{
            flex: "1 1 380px",
            background: "#0d1117",
            color: "#e8eaed",
            border: "1px solid #30363d",
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 13,
            fontFamily: "ui-monospace, monospace",
          }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{
            background: "#238636",
            color: "#e8eaed",
            border: "1px solid #2ea043",
            borderRadius: 8,
            padding: "9px 14px",
            fontSize: 13,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          {pending ? "Reading…" : "Import"}
        </button>
      </form>
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#8b949e" }}>
        The full path to a spreadsheet on this machine. It needs a shop-name column;
        address, city, ZIP, phone and website are used when present. Importing the same
        file again updates the shops rather than duplicating them.
      </p>
      {result && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 8,
            background: result.ok ? "#0d2818" : "#2d1214",
            border: "1px solid " + (result.ok ? "#2ea043" : "#f85149"),
          }}
        >
          <strong style={{ fontSize: 13.5 }}>{result.headline}</strong>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#c9d1d9" }}>
            {result.meaning}
          </p>
        </div>
      )}
    </div>
  );
}
