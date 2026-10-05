import "server-only";

import {
  bandFor,
  compareJerseyNumbers,
  type ConfidenceThresholds,
} from "@hl-bos/jersey-sort";

import type { GridTile, Option } from "@/components/PhotoGrid.tsx";

import type { Db } from "./db-core.ts";
import { listAlbums } from "./repo/albums.ts";
import { listPhotos, type PhotoFilters } from "./repo/photos.ts";
import { listPlayers } from "./repo/players.ts";

export interface GalleryData {
  readonly tiles: GridTile[];
  readonly total: number;
  readonly page: number;
  readonly pages: number;
  readonly players: Option[];
  readonly albums: Option[];
}

/** One page of a gallery, shaped for the grid. */
export function gallery(
  db: Db,
  org: string,
  userId: string,
  t: ConfidenceThresholds,
  filters: PhotoFilters,
  page: number,
  names: Readonly<Record<string, string>> = {},
): GalleryData {
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const { tiles, total, detections } = listPhotos(
    db,
    org,
    userId,
    t,
    filters,
    safePage,
  );
  return {
    tiles: tiles.map((tile) => ({
      id: tile.id,
      filename: tile.original_filename,
      status: tile.status,
      favorite: tile.favorite === 1,
      unusable: tile.unusable === 1,
      noJersey: tile.no_jersey_visible === 1,
      hasThumbnail: tile.has_thumbnail === 1,
      detections: (detections.get(tile.id) ?? [])
        .map((d) => ({
          value: d.detected_value,
          band:
            d.status === "confirmed"
              ? ("confirmed" as const)
              : bandFor(d.confidence, t),
        }))
        .sort((a, b) => compareJerseyNumbers(a.value, b.value)),
      names,
    })),
    total,
    page: safePage,
    pages: Math.max(1, Math.ceil(total / 120)),
    players: listPlayers(db, org, t.medium).map((p) => ({
      id: p.id,
      label: `${p.jersey_number !== null ? `#${p.jersey_number} ` : ""}${p.first_name} ${p.last_name} (${p.season_name})`,
    })),
    albums: listAlbums(db, org).map((a) => ({ id: a.id, label: a.name })),
  };
}
