"use server";

import {
  newSceneFlowCode,
  sceneflowStatus,
  startSceneFlow,
  type LaunchResult,
  type SceneFlowStatus,
} from "@/lib/sceneflow-launch";

/**
 * The console's side of "use SceneFlow from your phone".
 *
 * Thin wrappers, as everywhere else here: the decisions are in
 * sceneflow-access.ts (pure, tested) and the machine work is in
 * sceneflow-launch.ts.
 */

export async function launchSceneFlow(): Promise<LaunchResult> {
  return startSceneFlow();
}

export async function rotateSceneFlowCode(): Promise<LaunchResult> {
  return newSceneFlowCode();
}

export async function readSceneFlowStatus(): Promise<SceneFlowStatus> {
  return sceneflowStatus();
}
