import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  applyRetention,
  type PresenceRepository,
  type Prospect,
  type ScanRun,
} from "@hl-bos/presence-scanner";

/**
 * The Phase 1 store for the Presence Scanner: two JSON files in
 * apps/control-center/.data/presence-scanner/ (gitignored -- leads never reach
 * the repository). It is one implementation of PresenceRepository; the
 * scanner never knows it is a file. Phase 4 swaps in a repository over the
 * existing visibility/discovery tables without touching the scanner.
 *
 * Google's retention rule is applied on every read (applyRetention).
 * Writes go to a temporary file first and are renamed into place, so a crash
 * mid-write never leaves half a file.
 */
export class FilePresenceRepository implements PresenceRepository {
  constructor(
    private readonly dir: string = path.join(
      process.cwd(),
      ".data",
      "presence-scanner",
    ),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private file(name: string) {
    return path.join(this.dir, name);
  }

  private async read<T>(name: string): Promise<T[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file(name), "utf8"));
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private async write(name: string, data: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = this.file(`${name}.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tmp, JSON.stringify(data, null, 1), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(tmp, this.file(name));
  }

  async listProspects(): Promise<Prospect[]> {
    return applyRetention(await this.read<Prospect>("prospects.json"), this.now());
  }

  async getProspect(id: string): Promise<Prospect | undefined> {
    return (await this.listProspects()).find((p) => p.id === id);
  }

  async saveProspects(prospects: Prospect[]): Promise<void> {
    const all = new Map(
      (await this.read<Prospect>("prospects.json")).map((p) => [p.id, p]),
    );
    for (const p of prospects) all.set(p.id, p);
    // Persist with retention applied, so expired Google content is actually
    // deleted from disk, not merely hidden.
    await this.write("prospects.json", applyRetention([...all.values()], this.now()));
  }

  async listScans(): Promise<ScanRun[]> {
    return (await this.read<ScanRun>("scans.json")).sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
  }

  async saveScan(run: ScanRun): Promise<void> {
    const scans = (await this.read<ScanRun>("scans.json")).filter(
      (s) => s.id !== run.id,
    );
    await this.write("scans.json", [...scans, run]);
  }
}
