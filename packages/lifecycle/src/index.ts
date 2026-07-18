/**
 * @hl-bos/lifecycle — the Herman Legacy company lifecycle.
 *
 * The stages every company moves through — provision, operate, monitor, update,
 * back up, retire — and the remote-safety class of each action. Shared by the
 * operator plane (Headquarters) and the hosted cloud plane so they agree on
 * what may run where. See README.md.
 */

export {
  LIFECYCLE,
  PLANES,
  stage,
  allActions,
  actionsByPlane,
  type Plane,
  type PlaneInfo,
  type LifecycleStageKey,
  type LifecycleAction,
  type LifecycleStage,
} from "./lifecycle.js";
