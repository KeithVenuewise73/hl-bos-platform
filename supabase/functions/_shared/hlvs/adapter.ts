// Inert development-agent adapter (HLVS Factory).
//
// Claude is the primary development agent, but this adapter is AGENT-NEUTRAL and
// INERT. It accepts a generated prompt package, returns a simulated submission
// receipt, accepts fixture checkpoint reports, and demonstrates lifecycle
// transitions — WITHOUT contacting Claude or any external API, modifying a
// repository, creating a branch, committing code, running migrations, deploying
// software, or accessing secrets. Every response reports `external_execution:
// false`.

export const ADAPTER_VERSION = "hlvs-inert-adapter-0.1.0";

export interface SubmissionReceipt {
  accepted: boolean;
  external_execution: false;
  runId: string;
  promptVersion: string;
  note: string;
}

export interface FixtureCheckpointReport {
  checkpointNumber: number;
  checkpointName: string;
  accepted: boolean;
  external_execution: false;
}

export class InertDevelopmentAdapter {
  readonly version = ADAPTER_VERSION;

  // Accept a prompt package. Refuses anything carrying a secret; never calls out.
  submit(
    promptPackage: { version: string; jsonExport: Record<string, unknown> },
    runId: string,
  ): SubmissionReceipt {
    const serialized = JSON.stringify(promptPackage);
    if (/sk-ant-|sb_secret_|sk_live_|whsec_/i.test(serialized)) {
      return {
        accepted: false,
        external_execution: false,
        runId,
        promptVersion: promptPackage.version,
        note: "refused: secret detected",
      };
    }
    if (promptPackage.jsonExport?.live_execution !== false) {
      return {
        accepted: false,
        external_execution: false,
        runId,
        promptVersion: promptPackage.version,
        note: "refused: live_execution must be false",
      };
    }
    return {
      accepted: true,
      external_execution: false,
      runId,
      promptVersion: promptPackage.version,
      note: "simulated submission; Claude was NOT contacted",
    };
  }

  // Accept a fixture checkpoint report for lifecycle demonstration.
  ingestFixtureReport(
    checkpointNumber: number,
    checkpointName: string,
  ): FixtureCheckpointReport {
    return {
      checkpointNumber,
      checkpointName,
      accepted: true,
      external_execution: false,
    };
  }
}
