// The interaction graph (section 15).
//
// Interactions are edges over cast ids, not sentences. "Have Person B kiss
// Person D while the others move closer" becomes three edges, and three edges
// can be validated, reciprocated, diffed against the previous scene and capped
// at an intimacy ceiling. A sentence can only be hoped about.

import { interactionSpec, isInteractionType, reciprocalEdge } from "./vocabulary.js";
import { intimacyRank } from "./vocabulary.js";
import type {
  CastMemberId,
  IntimacyLevel,
  SceneInteraction,
  SceneInteractionGraph,
} from "./types.js";

export interface GraphIssue {
  readonly code:
    | "unknown_member"
    | "unknown_interaction"
    | "too_few_actors"
    | "too_many_actors"
    | "duplicate_actor"
    | "above_intimacy_ceiling";
  readonly detail: string;
}

/**
 * Validate a graph against the cast and the chosen intimacy ceiling.
 *
 * The ceiling check is a real gate, not advice: a user who selected "Warm"
 * cannot be handed a kiss edge by a preset, a branch or a custom direction.
 */
export function validateGraph(
  graph: SceneInteractionGraph,
  cast: readonly CastMemberId[],
  ceiling: IntimacyLevel,
): readonly GraphIssue[] {
  const issues: GraphIssue[] = [];
  const castSet = new Set(cast);
  const maxRank = intimacyRank(ceiling);

  for (const edge of graph) {
    if (!isInteractionType(edge.type)) {
      issues.push({ code: "unknown_interaction", detail: String(edge.type) });
      continue;
    }
    const spec = interactionSpec(edge.type);

    const seen = new Set<CastMemberId>();
    for (const actor of edge.actors) {
      if (!castSet.has(actor)) {
        issues.push({ code: "unknown_member", detail: `${edge.type}:${actor}` });
      }
      if (seen.has(actor)) {
        issues.push({ code: "duplicate_actor", detail: `${edge.type}:${actor}` });
      }
      seen.add(actor);
    }

    if (edge.actors.length < spec.minActors) {
      issues.push({
        code: "too_few_actors",
        detail: `${edge.type}:${edge.actors.length}`,
      });
    }
    if (spec.maxActors !== null && edge.actors.length > spec.maxActors) {
      issues.push({
        code: "too_many_actors",
        detail: `${edge.type}:${edge.actors.length}`,
      });
    }

    if (intimacyRank(spec.intimacy) > maxRank) {
      issues.push({
        code: "above_intimacy_ceiling",
        detail: `${edge.type}:${spec.intimacy}`,
      });
    }
  }

  return issues;
}

export function isValidGraph(
  graph: SceneInteractionGraph,
  cast: readonly CastMemberId[],
  ceiling: IntimacyLevel,
): boolean {
  return validateGraph(graph, cast, ceiling).length === 0;
}

/** Identity of an edge for de-duplication: type plus its actor set, order-free. */
function edgeKey(edge: SceneInteraction): string {
  return `${edge.type}|${[...edge.actors].sort().join(",")}`;
}

/** Directed "x acts on y", used to spot a pair that is already two-sided. */
function directedKey(actors: readonly CastMemberId[]): string | null {
  if (actors.length !== 2) return null;
  const [x, y] = actors;
  if (!x || !y) return null;
  return `${x}>${y}`;
}

/**
 * Apply Reciprocal Affection (section 17).
 *
 * Every returned edge is drawn from the same closed vocabulary and is filtered
 * against the same ceiling, so reciprocation can never escalate a scene past
 * what the user chose. An edge that is already mutual (a kiss, an embrace)
 * gains nothing — adding "B kisses A" next to "A kisses B" is noise.
 */
export function applyReciprocal(
  graph: SceneInteractionGraph,
  ceiling: IntimacyLevel,
): SceneInteractionGraph {
  const maxRank = intimacyRank(ceiling);
  const out: SceneInteraction[] = [...graph];
  const seen = new Set(graph.map(edgeKey));
  const directed = new Set(
    graph.map((e) => directedKey(e.actors)).filter((k): k is string => k !== null),
  );

  for (const edge of graph) {
    if (edge.reciprocal === true) continue;
    if (!isInteractionType(edge.type)) continue;

    // If B is already doing something back to A, the pair is two-sided and
    // needs nothing added. Without this, a user who staged both directions by
    // hand gets a third edge they did not ask for.
    const reverse = directedKey([...edge.actors].reverse());
    if (reverse !== null && directed.has(reverse)) continue;

    const reply = reciprocalEdge(edge.type, edge.actors);
    if (!reply) continue;
    if (intimacyRank(interactionSpec(reply.type).intimacy) > maxRank) continue;

    const candidate: SceneInteraction = { ...reply, reciprocal: true };
    const key = edgeKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    const replyDirected = directedKey(reply.actors);
    if (replyDirected !== null) directed.add(replyDirected);
    out.push(candidate);
  }

  return out;
}

/** Everyone named in any edge. */
export function actorsIn(graph: SceneInteractionGraph): readonly CastMemberId[] {
  const set = new Set<CastMemberId>();
  for (const edge of graph) for (const a of edge.actors) set.add(a);
  return [...set];
}

/**
 * Cast members with no edge at all. They are not dropped — section 19 wants the
 * rest of the cast to stay "naturally involved" — they are given an `observing`
 * edge so the prompt accounts for every person in the frame. A character the
 * prompt never mentions is a character the model feels free to delete.
 */
export function includeBystanders(
  graph: SceneInteractionGraph,
  cast: readonly CastMemberId[],
): SceneInteractionGraph {
  const engaged = new Set(actorsIn(graph));
  const extra: SceneInteraction[] = cast
    .filter((id) => !engaged.has(id))
    .map((id) => ({ actors: [id], type: "observing" }));
  return [...graph, ...extra];
}

/** The highest intimacy actually present in a graph, or null when it is empty. */
export function graphIntimacy(graph: SceneInteractionGraph): IntimacyLevel | null {
  let best: IntimacyLevel | null = null;
  for (const edge of graph) {
    if (!isInteractionType(edge.type)) continue;
    const level = interactionSpec(edge.type).intimacy;
    if (best === null || intimacyRank(level) > intimacyRank(best)) best = level;
  }
  return best;
}

/** Drop every edge above the ceiling. Used when a branch lowers the intimacy. */
export function capToCeiling(
  graph: SceneInteractionGraph,
  ceiling: IntimacyLevel,
): SceneInteractionGraph {
  const maxRank = intimacyRank(ceiling);
  return graph.filter(
    (edge) =>
      isInteractionType(edge.type) &&
      intimacyRank(interactionSpec(edge.type).intimacy) <= maxRank,
  );
}

/** How the prompt states the graph. */
export function renderGraph(
  graph: SceneInteractionGraph,
  labelOf: (id: CastMemberId) => string,
): string {
  return graph
    .map((edge) => {
      const who = edge.actors.map(labelOf).join(" and ");
      const spec = isInteractionType(edge.type) ? interactionSpec(edge.type) : null;
      const what = spec ? spec.phrasing : edge.type;
      return `- ${who}: ${what}${edge.reciprocal === true ? " (returned)" : ""}`;
    })
    .join("\n");
}
