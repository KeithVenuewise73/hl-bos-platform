/**
 * The canonical football vocabulary.
 *
 * Canonical, not prescriptive. A program that calls outside zone "Stretch"
 * stores that in filmstudy.team_terminology and the UI shows their word; these
 * lists are what the platform uses internally so two teams' film can be
 * compared at all.
 *
 * Every list is open at the edges: `isCanonical` tells you whether a term is
 * one we know, and nothing in this package refuses a term it has not seen.
 * Football is not a closed vocabulary, and a tagging screen that rejects a
 * coach's own concept name is a tagging screen they will stop using.
 */

/** Offensive personnel groupings, by the standard backs-and-tight-ends digits.
 *  "11" is 1 back, 1 tight end (so 3 receivers), and so on. */
export const PERSONNEL_PACKAGES = [
  "10",
  "11",
  "12",
  "13",
  "20",
  "21",
  "22",
  "23",
  "00",
  "01",
  "02",
] as const;

export const FORMATIONS = [
  "Trips",
  "Trips Right",
  "Trips Left",
  "Doubles",
  "Empty",
  "Bunch",
  "Stack",
  "I Formation",
  "Pistol",
  "Shotgun",
  "Singleback",
  "Wing",
  "Tight",
  "Ace",
] as const;

export const RUN_CONCEPTS = [
  "Inside Zone",
  "Outside Zone",
  "Power",
  "Counter",
  "Trap",
  "Duo",
  "Sweep",
  "Toss",
  "Iso",
  "QB Run",
  "Read Option",
] as const;

export const PASS_CONCEPTS = [
  "Slant",
  "Fade",
  "Hitch",
  "Curl",
  "Out",
  "Dig",
  "Post",
  "Corner",
  "Mesh",
  "Flood",
  "Four Verticals",
  "Screens",
  "Play Action",
  "RPO",
] as const;

export const DEFENSIVE_FRONTS = [
  "Odd",
  "Even",
  "Over",
  "Under",
  "Bear",
  "Tite",
  "4-3",
  "4-2-5",
  "3-4",
  "Nickel",
  "Dime",
] as const;

export const COVERAGES = [
  "Cover 0",
  "Cover 1",
  "Cover 2",
  "Cover 3",
  "Cover 4",
  "Cover 6",
  "Man",
  "Zone",
] as const;

export const PRESSURES = [
  "No pressure",
  "4-man rush",
  "Blitz",
  "Edge",
  "A-gap",
  "B-gap",
  "Overload",
] as const;

export type Personnel = (typeof PERSONNEL_PACKAGES)[number];
export type Formation = (typeof FORMATIONS)[number];
export type RunConcept = (typeof RUN_CONCEPTS)[number];
export type PassConcept = (typeof PASS_CONCEPTS)[number];
export type DefensiveFront = (typeof DEFENSIVE_FRONTS)[number];
export type Coverage = (typeof COVERAGES)[number];
export type Pressure = (typeof PRESSURES)[number];

export const ALL_CONCEPTS: readonly string[] = [...RUN_CONCEPTS, ...PASS_CONCEPTS];

/** Which family a canonical concept belongs to, or null if we do not know it.
 *  Null is a real answer: a coach may tag a concept this package has never
 *  heard of, and guessing its family would corrupt every run/pass split. */
export function conceptFamily(concept: string): "run" | "pass" | null {
  const needle = concept.trim().toLowerCase();
  if (RUN_CONCEPTS.some((c) => c.toLowerCase() === needle)) return "run";
  if (PASS_CONCEPTS.some((c) => c.toLowerCase() === needle)) return "pass";
  return null;
}

function memberOf(list: readonly string[], value: string): boolean {
  const needle = value.trim().toLowerCase();
  return list.some((v) => v.toLowerCase() === needle);
}

export function isCanonicalPersonnel(value: string): boolean {
  return memberOf(PERSONNEL_PACKAGES, value);
}
export function isCanonicalFormation(value: string): boolean {
  return memberOf(FORMATIONS, value);
}
export function isCanonicalCoverage(value: string): boolean {
  return memberOf(COVERAGES, value);
}
export function isCanonicalFront(value: string): boolean {
  return memberOf(DEFENSIVE_FRONTS, value);
}

/**
 * How many skill players a personnel grouping puts on the field.
 * "11" -> 1 back, 1 tight end, therefore 3 receivers.
 * Returns null for anything that is not two digits, rather than guessing.
 */
export function personnelBreakdown(
  value: string,
): { backs: number; tightEnds: number; receivers: number } | null {
  const trimmed = value.trim();
  if (!/^\d{2}$/.test(trimmed)) return null;
  const backs = Number(trimmed[0]);
  const tightEnds = Number(trimmed[1]);
  const receivers = 5 - backs - tightEnds;
  if (receivers < 0) return null;
  return { backs, tightEnds, receivers };
}
