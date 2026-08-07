/**
 * Navigation state logic — pure, DOM-free, and therefore unit-testable in the
 * Node test environment used across this workspace.
 *
 * The responsive header (SiteHeader) is a client component that holds this state
 * with useState and delegates every transition to these functions, so the
 * "navigation behavior" (open, close, toggle, close-on-select, close-on-escape)
 * is verified by nav.test.ts without needing a browser/jsdom.
 */

export interface NavState {
  /** Whether the mobile navigation panel is open. */
  readonly open: boolean;
}

export const initialNavState: NavState = { open: false };

export function openNav(): NavState {
  return { open: true };
}

export function closeNav(): NavState {
  return { open: false };
}

export function toggleNav(state: NavState): NavState {
  return { open: !state.open };
}

/** A navigation link was selected — the mobile panel should always close. */
export function selectItem(): NavState {
  return closeNav();
}

/** Key handler policy: Escape closes an open panel; nothing else changes it. */
export function onKey(state: NavState, key: string): NavState {
  if (key === "Escape") return closeNav();
  return state;
}
