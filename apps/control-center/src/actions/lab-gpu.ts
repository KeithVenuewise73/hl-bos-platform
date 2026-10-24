"use server";

import { labGpuStatus, switchLabGpu, type SwitchResult } from "@/lib/lab-gpu";
import type { LabGpuStatus } from "@/lib/lab-gpu-report";

/** Thin wrappers, as everywhere else here: decisions are in lab-gpu-report.ts. */

export async function turnLabGpuOn(): Promise<SwitchResult> {
  return switchLabGpu("on");
}

export async function turnLabGpuOff(): Promise<SwitchResult> {
  return switchLabGpu("off");
}

export async function readLabGpuStatus(): Promise<LabGpuStatus> {
  return labGpuStatus();
}
