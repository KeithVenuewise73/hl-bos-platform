/**
 * Working out what changed.
 *
 * The app holds a whole workspace in memory, mutates it, and asks the store to
 * persist the result. A file store just rewrites the file. A SQL store cannot:
 * it has to know which rows are new, which changed, and which disappeared.
 *
 * `updateWorkspace` has both the snapshot it loaded and the object after the
 * mutation, so the answer is a diff rather than a guess — no dirty flags to
 * forget to set, and no "upsert everything on every save", which would rewrite
 * a thousand rows to change one word.
 *
 * Pure and dependency-free: this is where a persistence bug would actually
 * live, so it is the part that gets unit tests.
 */

export interface Identified {
  readonly id: string;
}

export interface ReconcilePlan<T> {
  /** Rows that do not exist yet. */
  readonly inserted: readonly T[];
  /** Rows that exist and are different. */
  readonly updated: readonly T[];
  /** Ids that existed before and are gone now. */
  readonly deletedIds: readonly string[];
}

export function emptyPlan<T>(): ReconcilePlan<T> {
  return { inserted: [], updated: [], deletedIds: [] };
}

export function isEmptyPlan<T>(plan: ReconcilePlan<T>): boolean {
  return (
    plan.inserted.length === 0 &&
    plan.updated.length === 0 &&
    plan.deletedIds.length === 0
  );
}

/**
 * Compare two collections of the same entity by id.
 *
 * `equal` decides what "changed" means. It defaults to a structural comparison
 * rather than reference equality, because the app copies records freely —
 * `{...record}` with no field altered is not a change, and treating it as one
 * would mean every save rewrote every row it touched.
 */
export function reconcile<T extends Identified>(
  before: readonly T[],
  after: readonly T[],
  equal: (a: T, b: T) => boolean = deepEqual,
): ReconcilePlan<T> {
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterIds = new Set(after.map((row) => row.id));

  const inserted: T[] = [];
  const updated: T[] = [];
  for (const row of after) {
    const previous = beforeById.get(row.id);
    if (previous === undefined) inserted.push(row);
    else if (!equal(previous, row)) updated.push(row);
  }

  const deletedIds = before.map((row) => row.id).filter((id) => !afterIds.has(id));
  return { inserted, updated, deletedIds };
}

/**
 * Structural equality for plain JSON-shaped records.
 *
 * Everything the store persists is serialisable by construction — it all goes
 * through JSON in the file store — so this does not need to handle Dates, Maps
 * or cycles, and pretending otherwise would be dead code.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  // Undefined-valued keys are treated as absent: `exactOptionalPropertyTypes`
  // means the app spreads objects that may or may not carry a key, and
  // {a: 1} and {a: 1, b: undefined} describe the same record.
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const l = left[key];
    const r = right[key];
    if (l === undefined && r === undefined) continue;
    if (!deepEqual(l, r)) return false;
  }
  return true;
}

/** Total row writes a plan implies. Used for logging, not for decisions. */
export function planSize<T>(plan: ReconcilePlan<T>): number {
  return plan.inserted.length + plan.updated.length + plan.deletedIds.length;
}
