// De-duplication. Two records are the same business when they share, in
// priority order: a Google place ID, a website domain, a phone number, or a
// name-plus-street-address. A shared Facebook page counts by its full address,
// never by "facebook.com" -- otherwise every Facebook-only business would merge
// into one.

import {
  classifyUrl,
  domainOf,
  normalizeAddress,
  normalizeName,
  normalizePhone,
  toUrl,
} from "./normalize.ts";
import type { Candidate } from "./types.ts";

/** Identity keys for one record, strongest first. */
export function identityKeys(r: {
  placeId?: string | undefined;
  website?: string | undefined;
  phone?: string | undefined;
  name: string;
  address?: string | undefined;
}): string[] {
  const keys: string[] = [];
  if (r.placeId) keys.push(`place:${r.placeId}`);
  const url = toUrl(r.website);
  if (url) {
    const kind = classifyUrl(url).kind;
    if (kind === "site") {
      const d = domainOf(url);
      if (d) keys.push(`domain:${d}`);
    } else {
      const u = new URL(url);
      const path = u.pathname.replace(/\/+$/, "").toLowerCase();
      if (path !== "") keys.push(`page:${(domainOf(url) ?? "") + path}`);
    }
  }
  const phone = normalizePhone(r.phone);
  if (phone) keys.push(`phone:${phone}`);
  const addr = normalizeAddress(r.address);
  const name = normalizeName(r.name);
  if (addr && name) keys.push(`name_addr:${name}|${addr}`);
  // Nothing else to go on: the name alone, so a pasted duplicate still folds.
  if (keys.length === 0 && name) keys.push(`name:${name}`);
  return keys;
}

export function candidateKeys(c: Candidate): string[] {
  return identityKeys({
    placeId: c.place?.placeId,
    website: c.website ?? c.place?.website,
    phone: c.phone ?? c.place?.phone,
    name: c.name,
    address: c.address ?? c.place?.address,
  });
}

export interface DedupeGroup {
  /** The strongest key of the merged record. */
  key: string;
  keys: string[];
  /** The merged candidate (Google data preferred, gaps filled from the others). */
  merged: Candidate;
  members: Candidate[];
}

/** Group candidates that share any identity key (transitively). */
export function dedupeCandidates(candidates: Candidate[]): DedupeGroup[] {
  const parent = candidates.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const byKey = new Map<string, number>();
  const keysOf = candidates.map(candidateKeys);
  keysOf.forEach((keys, i) => {
    for (const k of keys) {
      const j = byKey.get(k);
      if (j === undefined) byKey.set(k, i);
      else parent[find(i)] = find(j);
    }
  });

  const groups = new Map<number, number[]>();
  candidates.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });

  const rank = (k: string) =>
    k.startsWith("place:")
      ? 0
      : k.startsWith("domain:") || k.startsWith("page:")
        ? 1
        : k.startsWith("phone:")
          ? 2
          : 3;

  return [...groups.values()].map((idx) => {
    const members = idx.map((i) => candidates[i]!);
    // Google records first: they carry the most verified fields.
    const ordered = [...members].sort(
      (a, b) =>
        Number(b.source === "google_places") - Number(a.source === "google_places"),
    );
    const pick = <K extends keyof Candidate>(k: K): Candidate[K] =>
      ordered.map((m) => m[k]).find((v) => v !== undefined) as Candidate[K];
    const merged: Candidate = {
      source: ordered[0]!.source,
      name: ordered[0]!.name,
      address: pick("address"),
      phone: pick("phone"),
      email: pick("email"),
      website: pick("website"),
      place: pick("place"),
      importedRating: pick("importedRating"),
      importedReviewCount: pick("importedReviewCount"),
    };
    const keys = [...new Set(idx.flatMap((i) => keysOf[i]!))].sort(
      (a, b) => rank(a) - rank(b),
    );
    return {
      key: keys[0] ?? `name:${normalizeName(merged.name)}`,
      keys,
      merged,
      members,
    };
  });
}
