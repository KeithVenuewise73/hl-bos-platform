/**
 * @hl-bos/playtime-engine
 *
 * The game participation engine: a log of timestamped events in, an accurate
 * picture of who played and for how long out. No UI, no database, no running
 * timer, no dependency on this quarter's product.
 *
 * It is separated from PlayTime Tracker's screens on purpose. The same
 * arithmetic is what AthleteHuddle, CoachesHuddle, OrganizationHuddle,
 * GameTracker and 5-Star Sports Media will need, and a Venuewise service is
 * something you lift out of one product intact -- not something you rewrite
 * from a React component four times.
 */

export * from "./types";
export * from "./events";
export * from "./clock";
export * from "./participation";
export * from "./format";
export * from "./report";
export * from "./sync";
export { newId } from "./ids";
