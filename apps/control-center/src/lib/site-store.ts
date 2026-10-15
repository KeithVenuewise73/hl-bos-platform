import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeProfile,
  type BusinessProfile,
  type BusinessProfileRepository,
  type PremiumDraft,
  type PremiumDraftRepository,
  type SiteDraft,
  type SiteDraftRepository,
} from "@hl-bos/site-builder";

import type { BatchRun } from "./batch";

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

/** Business Profiles on this computer: .data/site-builder/profiles.json (gitignored). */
export class FileProfileRepository implements BusinessProfileRepository {
  constructor(
    private readonly dir: string = path.join(process.cwd(), ".data", "site-builder"),
  ) {}

  private async all(): Promise<BusinessProfile[]> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(path.join(this.dir, "profiles.json"), "utf8"),
      );
      // Profiles saved by an older version gain any newer field as "required".
      return Array.isArray(parsed)
        ? (parsed as BusinessProfile[]).map(normalizeProfile)
        : [];
    } catch {
      return [];
    }
  }

  async get(id: string) {
    return (await this.all()).find((p) => p.id === id);
  }

  list() {
    return this.all();
  }

  async save(profile: BusinessProfile): Promise<void> {
    const rest = (await this.all()).filter((p) => p.id !== profile.id);
    await writeAtomic(this.dir, "profiles.json", [...rest, profile]);
  }
}

/** Batch build records: .data/site-builder/batches.json (gitignored), newest first. */
export class FileBatchStore {
  constructor(
    private readonly dir: string = path.join(process.cwd(), ".data", "site-builder"),
  ) {}

  async list(): Promise<BatchRun[]> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(path.join(this.dir, "batches.json"), "utf8"),
      );
      return Array.isArray(parsed) ? (parsed as BatchRun[]) : [];
    } catch {
      return [];
    }
  }

  async save(run: BatchRun): Promise<void> {
    const rest = (await this.list()).filter((r) => r.id !== run.id);
    await writeAtomic(this.dir, "batches.json", [run, ...rest].slice(0, 50));
  }
}

async function writeAtomic(dir: string, name: string, data: unknown): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 1), {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tmp, file);
}

/** Premium site drafts: .data/site-builder/premium.json (gitignored), one per profile. */
export class FilePremiumRepository implements PremiumDraftRepository {
  constructor(
    private readonly dir: string = path.join(process.cwd(), ".data", "site-builder"),
  ) {}

  private async all(): Promise<PremiumDraft[]> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(path.join(this.dir, "premium.json"), "utf8"),
      );
      return Array.isArray(parsed) ? (parsed as PremiumDraft[]) : [];
    } catch {
      return [];
    }
  }

  async getByProfile(profileId: string) {
    return (await this.all()).find((d) => d.profileId === profileId);
  }

  async save(draft: PremiumDraft): Promise<void> {
    const rest = (await this.all()).filter((d) => d.profileId !== draft.profileId);
    await writeAtomic(this.dir, "premium.json", [...rest, draft]);
  }
}
