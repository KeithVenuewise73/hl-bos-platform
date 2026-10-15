// Storage boundary for demo drafts, mirroring the Presence Scanner's: the
// builder never touches a file or a database. One draft per lead.

import type { PremiumDraft } from "./premium/draft.ts";
import type { BusinessProfile } from "./profile.ts";
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

/** Storage boundary for Business Profiles. */
export interface BusinessProfileRepository {
  get(id: string): Promise<BusinessProfile | undefined>;
  list(): Promise<BusinessProfile[]>;
  save(profile: BusinessProfile): Promise<void>;
}

export class MemoryProfileRepository implements BusinessProfileRepository {
  private profiles = new Map<string, BusinessProfile>();
  get(id: string) {
    return Promise.resolve(structuredClone(this.profiles.get(id)));
  }
  list() {
    return Promise.resolve([...this.profiles.values()].map((p) => structuredClone(p)));
  }
  save(profile: BusinessProfile) {
    this.profiles.set(profile.id, structuredClone(profile));
    return Promise.resolve();
  }
}

/** Storage boundary for Premium Business Site drafts: one per profile. */
export interface PremiumDraftRepository {
  getByProfile(profileId: string): Promise<PremiumDraft | undefined>;
  save(draft: PremiumDraft): Promise<void>;
}

export class MemoryPremiumRepository implements PremiumDraftRepository {
  private drafts = new Map<string, PremiumDraft>();
  getByProfile(profileId: string) {
    return Promise.resolve(structuredClone(this.drafts.get(profileId)));
  }
  save(draft: PremiumDraft) {
    this.drafts.set(draft.profileId, structuredClone(draft));
    return Promise.resolve();
  }
}
