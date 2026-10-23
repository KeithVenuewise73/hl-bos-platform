import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * True once this component is live in the browser (its event handlers are
 * attached), false while it is still the server-rendered HTML. Used to mark
 * file inputs `data-ready`, so an automated test never hands a file to an
 * input before anything listens to it. A person cannot hit that gap: the
 * buttons that open the file pickers only work once the page is live.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
