import type { ReleaseSettings, RevenueView } from "./revenue";

/**
 * Pilot safety checks, computed from what the database reports — never assumed.
 *
 * Each check reads a fact (the release settings the database enforces, the
 * records on the page, the dashboard's own statuses) and says plainly whether
 * the pilot is still inside the limits the owner approved. Any failure puts a
 * stop banner on the Revenue page.
 */
export interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export function pilotChecks(
  mode: "development" | "pilot",
  view: Pick<RevenueView, "release" | "dashboards" | "totals">,
): Check[] {
  const r: ReleaseSettings | undefined = view.release;
  if (!r)
    return [
      {
        key: "settings",
        label: "Release settings readable",
        ok: false,
        detail:
          "The database's release settings could not be read, so nothing about this environment can be confirmed.",
      },
    ];
  const off = (v: boolean, what: string): [boolean, string] =>
    v ? [false, `${what} is ON.`] : [true, `${what} is off.`];
  const rows: [string, string, [boolean, string]][] = [
    [
      "outbound",
      "No messages leave the platform",
      off(r.allow_outbound_delivery, "Outbound delivery"),
    ],
    [
      "auto",
      "No automatic notifications",
      off(r.allow_auto_notifications, "Automatic notifications"),
    ],
    ["paid", "No paid discovery", off(r.allow_paid_discovery, "Paid discovery")],
  ];
  if (mode === "pilot") {
    rows.unshift([
      "env",
      "Database is in pilot mode",
      r.environment === "pilot"
        ? [true, "The database reports environment = pilot."]
        : [false, `The database reports environment = ${r.environment}.`],
    ]);
    rows.push(
      ["mock", "No mock deliveries", off(r.allow_mock_delivery, "Mock delivery")],
      [
        "synthetic",
        "No synthetic records",
        r.allow_synthetic_records
          ? [false, "Synthetic records are allowed."]
          : view.totals.synthetic > 0
            ? [
                false,
                `${view.totals.synthetic} synthetic record(s) are present in the pilot.`,
              ]
            : [true, "Synthetic records are refused, and none are present."],
      ],
    );
  }
  const fabricated = view.dashboards
    .flatMap((d) => d.metrics)
    .filter((m) => m.unit === "cents" && m.value !== null);
  rows.push([
    "money",
    "No financial figure without a connected source",
    fabricated.length === 0
      ? [
          true,
          "Revenue, cost and value figures show as not connected / no data — no agreement or spending source is connected.",
        ]
      : [
          false,
          `A financial figure is shown with no connected source: ${fabricated.map((m) => m.label).join(", ")}.`,
        ],
  ]);
  return rows.map(([key, label, [ok, detail]]) => ({ key, label, ok, detail }));
}
