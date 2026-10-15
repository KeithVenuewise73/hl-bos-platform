// Storage boundary. The scanner never touches a file or a database directly;
// it reads and writes through PresenceRepository.
//
// Phase 1 uses a local store (the Control Center's file store, and the memory
// store below for tests). The same interface is meant to sit over the EXISTING
// HL-BOS tables later -- see docs/products/presence-scanner/README.md for the
// column-by-column mapping onto visibility.prospects, visibility.assessments,
// discovery.evidence and discovery.website_scans.

import { expirePlacesContent } from "./places.ts";
import type { Prospect, ScanRun } from "./types.ts";

export interface PresenceRepository {
  listProspects(): Promise<Prospect[]>;
  getProspect(id: string): Promise<Prospect | undefined>;
  /** Insert or replace by id. */
  saveProspects(prospects: Prospect[]): Promise<void>;
  listScans(): Promise<ScanRun[]>;
  saveScan(run: ScanRun): Promise<void>;
}

/** Applied on every read, by every repository: Google's retention rule. */
export function applyRetention(prospects: Prospect[], now: Date): Prospect[] {
  return prospects.map((p) => expirePlacesContent(p, now));
}

export class MemoryRepository implements PresenceRepository {
  private prospects = new Map<string, Prospect>();
  private scans: ScanRun[] = [];
  constructor(private readonly now: () => Date = () => new Date()) {}

  listProspects(): Promise<Prospect[]> {
    return Promise.resolve(applyRetention([...this.prospects.values()], this.now()));
  }
  getProspect(id: string): Promise<Prospect | undefined> {
    const p = this.prospects.get(id);
    return Promise.resolve(p ? applyRetention([p], this.now())[0] : undefined);
  }
  saveProspects(ps: Prospect[]): Promise<void> {
    for (const p of ps) this.prospects.set(p.id, structuredClone(p));
    return Promise.resolve();
  }
  listScans(): Promise<ScanRun[]> {
    return Promise.resolve(
      [...this.scans].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    );
  }
  saveScan(run: ScanRun): Promise<void> {
    this.scans = [...this.scans.filter((s) => s.id !== run.id), structuredClone(run)];
    return Promise.resolve();
  }
}
