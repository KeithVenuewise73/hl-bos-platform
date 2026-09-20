// CharacterLock (section 11) and cast construction (section 10).
//
// Detection tells us HOW MANY people are in a photograph and roughly where.
// This module decides who is who ACROSS scenes, which is the part that makes
// the product work: a stable id per recurring subject, carried into every
// continuation, so Person C is still Person C in scene six.
//
// It never attempts real-world identity. Labels are "Person A".."Person H" and
// the descriptors are non-identifying appearance notes only.

import {
  CAST_MEMBER_IDS,
  MAX_CAST_SIZE,
  MIN_CAST_SIZE,
  type Cast,
  type CastMember,
  type CastMemberId,
  type CharacterDescriptor,
} from "./types";

export class CastError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "CastError";
    this.code = code;
  }
}

/** One detected person, before they become a cast member. */
export interface DetectedSubject {
  /** Crop of the source image, as a private storage path. */
  readonly referencePath: string;
  readonly appearance?: CharacterDescriptor;
  /** Left-to-right ordering in the source image, used to assign A..H. */
  readonly sortOrder: number;
}

export function labelFor(id: CastMemberId): string {
  return `Person ${id.slice("person_".length).toUpperCase()}`;
}

/**
 * Assign stable ids to detected subjects, left to right.
 *
 * Left-to-right is deliberate and not cosmetic: it is reproducible. Re-running
 * detection on the same photograph produces the same ids, so a story that was
 * built around Person D does not silently re-point at someone else.
 */
export function buildCast(
  castId: string,
  detected: readonly DetectedSubject[],
  attestation: {
    readonly adultConfirmed: boolean;
    readonly permissionConfirmed: boolean;
  },
): Cast {
  if (detected.length < MIN_CAST_SIZE) throw new CastError("cast_too_small");
  if (detected.length > MAX_CAST_SIZE) throw new CastError("cast_too_large");

  const ordered = [...detected].sort((a, b) => a.sortOrder - b.sortOrder);
  const members: CastMember[] = ordered.map((subject, index) => {
    const id = CAST_MEMBER_IDS[index];
    /* c8 ignore next -- index is bounded by the size check above */
    if (!id) throw new CastError("cast_too_large");
    return {
      id,
      label: labelFor(id),
      appearance: subject.appearance ?? {},
      sortOrder: index,
      // An empty path is NOT a reference. Recorded as one it would make
      // describeForPrompt claim "1 reference image supplied" when none was,
      // and hand the provider an empty string where an image belongs.
      referencePaths:
        subject.referencePath.trim() === "" ? [] : [subject.referencePath],
    };
  });

  return {
    id: castId,
    members,
    adultConfirmed: attestation.adultConfirmed,
    permissionConfirmed: attestation.permissionConfirmed,
  };
}

/**
 * Drop the subjects the user chose to remove (section 10), keeping the ids of
 * everyone who stays.
 *
 * Ids are NOT recompacted. If Person B is removed, Person C stays Person C —
 * renumbering would repoint every stored scene, focus list and interaction edge
 * at a different human being.
 */
export function keepOnly(cast: Cast, keep: readonly CastMemberId[]): Cast {
  const keepSet = new Set(keep);
  const members = cast.members.filter((m) => keepSet.has(m.id));
  if (members.length < MIN_CAST_SIZE) throw new CastError("cast_too_small");
  return { ...cast, members };
}

export function memberIds(cast: Cast): readonly CastMemberId[] {
  return cast.members.map((m) => m.id);
}

export function findMember(cast: Cast, id: CastMemberId): CastMember | null {
  return cast.members.find((m) => m.id === id) ?? null;
}

/**
 * The identity block CharacterLock contributes to every prompt.
 *
 * Only what the source photograph actually showed. An absent trait is omitted
 * rather than guessed — inventing "mid-thirties, athletic build" for someone the
 * photo does not support is inventing a person, and it is exactly how a cast
 * drifts into strangers by scene four.
 */
export function describeForPrompt(member: CastMember): string {
  const a = member.appearance;
  const parts: string[] = [];
  if (a.apparentAgeBand) parts.push(`apparent adult age ${a.apparentAgeBand}`);
  if (a.build) parts.push(`${a.build} build`);
  if (a.hair) parts.push(a.hair);
  if (a.complexion) parts.push(a.complexion);
  if (a.distinguishingFeatures && a.distinguishingFeatures.length > 0) {
    parts.push(a.distinguishingFeatures.join(", "));
  }

  const refs = member.referencePaths.length;
  const refNote =
    refs > 0
      ? `${refs} reference image${refs === 1 ? "" : "s"} supplied`
      : "no reference image supplied";

  if (parts.length === 0) {
    return `${member.label} (${member.id}): preserve exactly as shown in the source and reference images; ${refNote}.`;
  }
  return `${member.label} (${member.id}): ${parts.join("; ")}; ${refNote}.`;
}

/** Every reference image the generator may condition on, keyed by character id. */
export function referenceMap(cast: Cast): Readonly<Record<string, readonly string[]>> {
  const map: Record<string, readonly string[]> = {};
  for (const member of cast.members) map[member.id] = member.referencePaths;
  return map;
}

/** Attach another reference image to a member (section 8: up to five uploads). */
export function addReference(
  cast: Cast,
  id: CastMemberId,
  path: string,
  maxPerMember = 5,
): Cast {
  const members = cast.members.map((m) => {
    if (m.id !== id) return m;
    if (path.trim() === "") throw new CastError("empty_reference_path");
    if (m.referencePaths.includes(path)) return m;
    if (m.referencePaths.length >= maxPerMember)
      throw new CastError("too_many_references");
    return { ...m, referencePaths: [...m.referencePaths, path] };
  });
  return { ...cast, members };
}
