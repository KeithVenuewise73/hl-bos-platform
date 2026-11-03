"use server";

import { diagnosticReport } from "@/lib/diagnose";
import { allowPhonesThroughFirewall, type RuleResult } from "@/lib/firewall";
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

/**
 * Ask Windows to let phones on the home network through to SceneFlow.
 *
 * Raises the standard Windows permission prompt, because this console does not
 * run as Administrator and should not. Declining it is reported as what it is.
 */
export async function allowPhones(): Promise<RuleResult> {
  return allowPhonesThroughFirewall();
}

/**
 * Everything Claude needs to diagnose a problem, in one block of text.
 *
 * Built because four rounds were spent asking him to read things off a screen.
 * Contains no secrets: the access code is reported as set or not set, never as
 * its value.
 */
export async function sceneFlowDiagnostics(): Promise<string> {
  return diagnosticReport();
}
