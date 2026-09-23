// Equipment registry.
//
// Equipment types are DATA, not code. The defaults below describe common
// North American trailers; a tenant extends or overrides them by passing its
// own entries to `buildEquipmentRegistry`. Adding "walking-floor" or
// "end-dump-tri-axle" next quarter is a registry entry, not a release.

import type { EquipmentType } from "./types";

/** Commodity classes the default registry knows about. Also an open list. */
export const COMMODITY_CLASSES = {
  aggregate: "Aggregate / stone / gravel",
  sand: "Sand",
  mulch: "Mulch / wood chips / compost",
  soil: "Soil / fill",
  "scrap-metal": "Scrap metal",
  "asphalt-millings": "Asphalt millings",
  "bulk-salt": "Bulk road salt",
  steel: "Steel (coil, plate, beam)",
  lumber: "Lumber",
  machinery: "Machinery / equipment",
  "building-materials": "Building materials",
  "palletized-general": "Palletized general freight",
  "dry-bulk-powder": "Dry bulk powder (cement, lime, flour)",
  "liquid-bulk": "Bulk liquid",
  refrigerated: "Refrigerated / temperature-controlled",
} as const;

export const DEFAULT_EQUIPMENT_TYPES: readonly EquipmentType[] = [
  {
    id: "dump",
    label: "Dump trailer",
    allowedCommodityClasses: [
      "aggregate",
      "sand",
      "mulch",
      "soil",
      "scrap-metal",
      "asphalt-millings",
      "bulk-salt",
    ],
    measuresVolume: true,
    notes:
      "Loose bulk only. Cannot haul palletized or packaged freight, liquids or powders.",
  },
  {
    id: "flatbed",
    label: "Flatbed",
    allowedCommodityClasses: [
      "steel",
      "lumber",
      "machinery",
      "building-materials",
      "palletized-general",
    ],
    measuresVolume: false,
    notes: "Secured, tarped freight. Cannot haul loose bulk, liquids or powders.",
  },
  {
    id: "step-deck",
    label: "Step deck",
    allowedCommodityClasses: ["steel", "lumber", "machinery", "building-materials"],
    measuresVolume: false,
  },
  {
    id: "pneumatic-tanker",
    label: "Pneumatic dry-bulk tanker",
    allowedCommodityClasses: ["dry-bulk-powder"],
    measuresVolume: false,
    notes: "Dry bulk powders only (cement, lime, fly ash, flour).",
  },
  {
    id: "liquid-tanker",
    label: "Liquid tanker",
    allowedCommodityClasses: ["liquid-bulk"],
    measuresVolume: false,
  },
  {
    id: "dry-van",
    label: "Dry van",
    allowedCommodityClasses: ["palletized-general", "building-materials"],
    measuresVolume: false,
  },
  {
    id: "reefer",
    label: "Refrigerated van",
    allowedCommodityClasses: ["refrigerated", "palletized-general"],
    measuresVolume: false,
  },
  {
    id: "box-truck",
    label: "Box truck",
    allowedCommodityClasses: ["palletized-general"],
    measuresVolume: false,
  },
  {
    id: "cargo-van",
    label: "Cargo van",
    allowedCommodityClasses: ["palletized-general"],
    measuresVolume: false,
  },
];

export type EquipmentRegistry = ReadonlyMap<string, EquipmentType>;

/**
 * Defaults plus a tenant's own entries. A tenant entry with an existing id
 * REPLACES the default (a fleet may define "flatbed" more narrowly).
 */
export function buildEquipmentRegistry(
  tenantTypes: readonly EquipmentType[] = [],
): EquipmentRegistry {
  const map = new Map<string, EquipmentType>();
  for (const t of DEFAULT_EQUIPMENT_TYPES) map.set(t.id, t);
  for (const t of tenantTypes) map.set(t.id, t);
  return map;
}
