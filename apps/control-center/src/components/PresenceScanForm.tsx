"use client";

import { useState, useTransition } from "react";

import { runPresenceScan } from "@/actions/presence";
import type { PresenceResult } from "@/lib/presence";

import { button, C, input, label } from "./presence-style";

const VERTICALS: [string, string][] = [
  ["contractor", "Contractor / home services"],
  ["salon_barber", "Salon / barber"],
  ["restaurant_bar", "Restaurant / bar"],
  ["trainer_coach", "Trainer / coach"],
  ["youth_sports", "Youth sports organization"],
];

const EXAMPLE = `name,website,phone,address
Example Roofing,exampleroofing.com,716-555-0100,12 Main St
Example Paving,none,716-555-0101,
Example Masonry,https://facebook.com/examplemasonry,716-555-0102,`;

export function PresenceScanForm({ placesConnected }: { placesConnected: boolean }) {
  const [source, setSource] = useState<"google_places" | "import">(
    placesConnected ? "google_places" : "import",
  );
  const [importText, setImportText] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) {
      setResult({
        ok: false,
        headline: "That file is too large.",
        meaning: "Import files are limited to 1 MB.",
      });
      return;
    }
    void f.text().then(setImportText);
  };

  return (
    <form
      action={(fd) =>
        start(async () => {
          setResult(null);
          setResult(await runPresenceScan(fd));
        })
      }
    >
      <div style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 13 }}>
        <label style={{ opacity: placesConnected ? 1 : 0.55 }}>
          <input
            type="radio"
            name="source"
            value="google_places"
            checked={source === "google_places"}
            disabled={!placesConnected}
            onChange={() => setSource("google_places")}
          />{" "}
          Search Google Places
        </label>
        <label>
          <input
            type="radio"
            name="source"
            value="import"
            checked={source === "import"}
            onChange={() => setSource("import")}
          />{" "}
          Paste a list or import a CSV
        </label>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <label style={label} htmlFor="market">
            Market or town
          </label>
          <input
            id="market"
            name="market"
            style={input}
            defaultValue="West Seneca and Orchard Park"
          />
        </div>
        <div>
          <label style={label} htmlFor="zip">
            ZIP code
          </label>
          <input
            id="zip"
            name="zip"
            style={input}
            defaultValue="14224"
            inputMode="numeric"
          />
        </div>
        <div>
          <label style={label} htmlFor="radius">
            Radius (miles)
          </label>
          <input
            id="radius"
            name="radius"
            type="number"
            min={1}
            max={50}
            style={input}
            defaultValue={10}
          />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 2fr",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <label style={label} htmlFor="vertical">
            Business vertical
          </label>
          <select id="vertical" name="vertical" style={input} defaultValue="contractor">
            {VERTICALS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="maxResults">
            Maximum results
          </label>
          <input
            id="maxResults"
            name="maxResults"
            type="number"
            min={1}
            max={60}
            style={input}
            defaultValue={20}
          />
        </div>
        <div>
          <label style={label} htmlFor="searchTerms">
            Search terms (optional)
          </label>
          <input
            id="searchTerms"
            name="searchTerms"
            style={input}
            placeholder={
              source === "google_places"
                ? "e.g. roofing contractor"
                : "Used for Google searches only"
            }
            disabled={source !== "google_places"}
          />
        </div>
      </div>

      {source === "import" ? (
        <div style={{ marginBottom: 12 }}>
          <label style={label} htmlFor="importText">
            Businesses — one per line, or a CSV with a header row. Write{" "}
            <code>none</code> as the website if they have none; leave it blank if you do
            not know.
          </label>
          <textarea
            id="importText"
            name="importText"
            rows={8}
            style={{ ...input, fontFamily: "ui-monospace, monospace" }}
            placeholder={EXAMPLE}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div style={{ marginTop: 6, fontSize: 12, color: C.muted }}>
            Or load a CSV file:{" "}
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
        </div>
      ) : (
        <p
          style={{ margin: "0 0 12px", fontSize: 12, color: C.muted, lineHeight: 1.6 }}
        >
          One Google search returns at most 60 businesses and is billed per request
          (about US$0.035 each at Google&rsquo;s list price; 20 businesses per request).
          The cost of every scan is shown when it finishes.
        </p>
      )}

      <button type="submit" disabled={pending} style={button(true, pending)}>
        {pending
          ? "Scanning… (each website is inspected; this can take a minute)"
          : "Run scan"}
      </button>

      {result ? (
        <div
          role="status"
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${result.ok ? "#2ea043" : C.red}`,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <strong>{result.headline}</strong>
          <div style={{ color: C.muted }}>{result.meaning}</div>
        </div>
      ) : null}
    </form>
  );
}
