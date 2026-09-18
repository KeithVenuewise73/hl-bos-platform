/**
 * How this installation is allowed to run.
 *
 * This is the guard that stops the accident the app is most exposed to.
 *
 * The HighlightAI Hockey was built local-first: no login, data in a JSON file
 * on the machine running it. That is a sane shape for a tool you start from the
 * Control Center on your own desktop, and a catastrophic one on a public URL —
 * a family's game video is footage of a child, at a named rink, on a known
 * date, beside their name, team and jersey number. Deployed without a login,
 * all of it is readable by anyone who finds the address.
 *
 * So the mode is DERIVED, never configured by hand, and the deployed case
 * fails closed: if this process thinks it is in a deployed environment and no
 * identity provider is configured, it refuses to serve the app at all rather
 * than serving it to the public.
 *
 * Pure and dependency-free so it can be unit-tested, which matters more here
 * than anywhere else in the app.
 */

export type DeploymentMode =
  /** Local, single operator, no login. The data never leaves the machine. */
  | "local"
  /** Deployed or configured with Supabase: every request must be signed in. */
  | "authenticated"
  /** Deployed with no way to authenticate. Serve nothing. */
  | "refuse";

export interface DeploymentInputs {
  /** HL_BOS_ENV: local | preview | staging | production. */
  readonly hlBosEnv: string | undefined;
  readonly nodeEnv: string | undefined;
  readonly supabaseUrl: string | undefined;
  readonly supabaseKey: string | undefined;
}

/** Environments that are reachable by someone other than the operator. */
const DEPLOYED_ENVIRONMENTS = new Set(["preview", "staging", "production"]);

export function isDeployedEnvironment(inputs: DeploymentInputs): boolean {
  if (inputs.hlBosEnv !== undefined && inputs.hlBosEnv.length > 0) {
    return DEPLOYED_ENVIRONMENTS.has(inputs.hlBosEnv);
  }
  // No HL_BOS_ENV set: fall back to NODE_ENV. A production build being served
  // is treated as deployed, because that is the case where being wrong is
  // expensive and the cost of being cautious is one environment variable.
  return inputs.nodeEnv === "production";
}

export function supabaseConfigured(inputs: DeploymentInputs): boolean {
  return (
    inputs.supabaseUrl !== undefined &&
    inputs.supabaseUrl.length > 0 &&
    inputs.supabaseKey !== undefined &&
    inputs.supabaseKey.length > 0
  );
}

export function deploymentMode(inputs: DeploymentInputs): DeploymentMode {
  const configured = supabaseConfigured(inputs);
  if (isDeployedEnvironment(inputs)) {
    // Deployed. Authentication is not optional, and "no auth configured" is
    // not a reason to fall back to serving it openly.
    return configured ? "authenticated" : "refuse";
  }
  // Not deployed. Supabase configured locally still means sign in — it is how
  // you work against your real data from a laptop.
  return configured ? "authenticated" : "local";
}

/** What Settings, the banner and the refusal page say. Plain English. */
export function describeMode(mode: DeploymentMode): string {
  switch (mode) {
    case "local":
      return "Local mode. No sign-in, and your data is stored in a file on this machine only. Nothing is published and nobody else can reach it.";
    case "authenticated":
      return "Signed-in mode. Every page requires a Supabase account, and each person sees only their own records.";
    case "refuse":
      return "This app is running in a deployed environment with no identity provider configured. It is refusing to serve, because starting without a login would publish a family's game video to anyone who found the address.";
    default:
      return "";
  }
}
