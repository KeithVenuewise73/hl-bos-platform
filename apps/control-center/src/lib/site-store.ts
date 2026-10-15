import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SiteDraft, SiteDraftRepository } from "@hl-bos/site-builder";

/**
 * Demo drafts on this computer: apps/control-center/.data/site-builder/
 * drafts.json (gitignored). One implementation of SiteDraftRepository, like
 * the Presence Scanner's file store; atomic writes. Pages are rendered from
 * the draft on request, so no HTML file is ever left lying around to publish.
 */
export class FileDraftRepository implements SiteDraftRepository {
  constructor(
    private readonly dir: string = path.join(process.cwd(), ".data", "site-builder"),
  ) {}

  private async all(): Promise<SiteDraft[]> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(path.join(this.dir, "drafts.json"), "utf8"),
      );
      return Array.isArray(parsed) ? (parsed as SiteDraft[]) : [];
    } catch {
      return [];
    }
  }

  async getByProspect(prospectId: string) {
    return (await this.all()).find((d) => d.prospectId === prospectId);
  }

  async get(id: string) {
    return (await this.all()).find((d) => d.id === id);
  }

  list() {
    return this.all();
  }

  async save(draft: SiteDraft): Promise<void> {
    const drafts = (await this.all()).filter((d) => d.id !== draft.id);
    await mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, "drafts.json");
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify([...drafts, draft], null, 1), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(tmp, file);
  }
}
