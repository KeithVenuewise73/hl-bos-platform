// Storage boundary for demo drafts, mirroring the Presence Scanner's: the
// builder never touches a file or a database. One draft per lead.

import type { SiteDraft } from "./types.ts";

export interface SiteDraftRepository {
  getByProspect(prospectId: string): Promise<SiteDraft | undefined>;
  get(id: string): Promise<SiteDraft | undefined>;
  list(): Promise<SiteDraft[]>;
  save(draft: SiteDraft): Promise<void>;
}

export class MemoryDraftRepository implements SiteDraftRepository {
  private drafts = new Map<string, SiteDraft>();
  getByProspect(prospectId: string) {
    return Promise.resolve(
      [...this.drafts.values()].find((d) => d.prospectId === prospectId),
    );
  }
  get(id: string) {
    return Promise.resolve(this.drafts.get(id));
  }
  list() {
    return Promise.resolve([...this.drafts.values()]);
  }
  save(draft: SiteDraft) {
    this.drafts.set(draft.id, structuredClone(draft));
    return Promise.resolve();
  }
}
