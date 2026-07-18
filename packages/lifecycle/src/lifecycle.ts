/**
 * The Herman Legacy company lifecycle.
 *
 * Every Herman Legacy company — and, later, every external customer — moves
 * through the same stages, operated through Headquarters and its hosted cloud
 * plane: provision, operate, monitor, update, back up, retire.
 *
 * Each action carries a `plane` classification that encodes the remote-safety
 * boundary directly in the model, so both planes agree on what may run where:
 *
 *   - remote-safe       runs in the hosted cloud plane
 *   - local-privileged  stays in the local operator plane (Headquarters)
 *   - promoted          runs in the cloud plane only behind an authenticated,
 *                       authorized API — the one reviewed bridge across the line
 */

export type Plane = "remote-safe" | "local-privileged" | "promoted";

export interface PlaneInfo {
  readonly label: string;
  readonly runsIn: string;
}

export const PLANES: Record<Plane, PlaneInfo> = {
  "remote-safe": {
    label: "Remote-safe",
    runsIn: "Cloud plane (hosted)",
  },
  "local-privileged": {
    label: "Local-privileged",
    runsIn: "Operator plane — local only",
  },
  promoted: {
    label: "Promoted",
    runsIn: "Cloud plane, behind an authenticated + authorized API",
  },
};

export type LifecycleStageKey =
  "provision" | "operate" | "monitor" | "update" | "backup" | "retire";

export interface LifecycleAction {
  readonly key: string;
  readonly title: string;
  readonly plane: Plane;
  readonly summary: string;
}

export interface LifecycleStage {
  readonly key: LifecycleStageKey;
  readonly title: string;
  readonly summary: string;
  readonly actions: readonly LifecycleAction[];
}

/**
 * The lifecycle, in order. This is design, not yet implementation: it names the
 * capability Headquarters is being built to deliver end to end, and fixes where
 * each action is allowed to run. Actions become real as the platform lands them.
 */
export const LIFECYCLE: readonly LifecycleStage[] = [
  {
    key: "provision",
    title: "Provision",
    summary: "Bring a company online as a tenant.",
    actions: [
      {
        key: "create-tenant",
        title: "Create tenant",
        plane: "remote-safe",
        summary:
          "Create the company's tenant record and set its class — first-party or customer. One path for both.",
      },
      {
        key: "activate-modules",
        title: "Activate modules",
        plane: "remote-safe",
        summary: "Turn on the products and verticals the company will use.",
      },
      {
        key: "invite-members",
        title: "Invite members",
        plane: "remote-safe",
        summary:
          "Add the company's people and assign roles under the permission model.",
      },
      {
        key: "deploy-apps",
        title: "Deploy applications",
        plane: "remote-safe",
        summary: "Deploy the company's applications through the provider abstraction.",
      },
    ],
  },
  {
    key: "operate",
    title: "Operate",
    summary: "Run the company day to day.",
    actions: [
      {
        key: "manage-members",
        title: "Manage members",
        plane: "remote-safe",
        summary: "Add, remove and re-role members.",
      },
      {
        key: "manage-plan",
        title: "Manage plan",
        plane: "remote-safe",
        summary: "Change the company's plan, features and limits.",
      },
      {
        key: "configure-integrations",
        title: "Configure integrations",
        plane: "remote-safe",
        summary:
          "Point integrations at credentials by vault key — never a secret value in the browser.",
      },
      {
        key: "rotate-secrets",
        title: "Rotate secrets",
        plane: "promoted",
        summary:
          "Rotate a stored credential in the vault — privileged, exposed only through an authenticated, authorized API.",
      },
    ],
  },
  {
    key: "monitor",
    title: "Monitor",
    summary: "See how the company is doing.",
    actions: [
      {
        key: "view-health",
        title: "View health",
        plane: "remote-safe",
        summary: "Deployment, job-run and audit status for the company.",
      },
      {
        key: "view-usage",
        title: "View usage",
        plane: "remote-safe",
        summary: "Entitlement usage against plan limits.",
      },
      {
        key: "manage-alerts",
        title: "Manage alerts",
        plane: "remote-safe",
        summary: "Configure and acknowledge alerts.",
      },
    ],
  },
  {
    key: "update",
    title: "Update",
    summary: "Change what is running.",
    actions: [
      {
        key: "deploy-version",
        title: "Deploy new version",
        plane: "remote-safe",
        summary:
          "Ship to preview, then promote to production — through the provider abstraction.",
      },
      {
        key: "rollback-deploy",
        title: "Roll back deployment",
        plane: "remote-safe",
        summary: "Return to a previous known-good deployment.",
      },
      {
        key: "apply-migration",
        title: "Apply migration",
        plane: "local-privileged",
        summary:
          "Apply a database migration. Stays in the operator plane behind an approval gate; never auto-applied from the cloud.",
      },
    ],
  },
  {
    key: "backup",
    title: "Back up",
    summary: "Protect the company's data.",
    actions: [
      {
        key: "configure-backups",
        title: "Configure backups",
        plane: "remote-safe",
        summary: "Set the backup schedule and retention policy.",
      },
      {
        key: "verify-backup",
        title: "Verify backup",
        plane: "remote-safe",
        summary: "Confirm recent backups exist and are restorable.",
      },
      {
        key: "trigger-backup",
        title: "Take a backup",
        plane: "promoted",
        summary:
          "Take an on-demand backup — privileged, exposed only through an authenticated API.",
      },
      {
        key: "restore-backup",
        title: "Restore backup",
        plane: "promoted",
        summary:
          "Restore from a backup — destructive; authenticated, authorized and explicitly confirmed.",
      },
    ],
  },
  {
    key: "retire",
    title: "Retire",
    summary: "Decommission a company.",
    actions: [
      {
        key: "suspend-tenant",
        title: "Suspend tenant",
        plane: "remote-safe",
        summary: "Suspend the company (reversible); access stops, data is retained.",
      },
      {
        key: "export-data",
        title: "Export data",
        plane: "promoted",
        summary: "Produce a full data export — privileged and authenticated.",
      },
      {
        key: "purge-tenant",
        title: "Purge tenant",
        plane: "local-privileged",
        summary:
          "Permanently delete the company's data. Irreversible; stays in the operator plane with the strongest authorization.",
      },
    ],
  },
];

/** The lifecycle stage with this key. */
export function stage(key: LifecycleStageKey): LifecycleStage {
  const found = LIFECYCLE.find((s) => s.key === key);
  if (!found) {
    throw new Error(`Unknown lifecycle stage: ${key}`);
  }
  return found;
}

/** Every action across every stage, in lifecycle order. */
export function allActions(): readonly LifecycleAction[] {
  return LIFECYCLE.flatMap((s) => s.actions);
}

/** Every action assigned to a given plane. */
export function actionsByPlane(plane: Plane): readonly LifecycleAction[] {
  return allActions().filter((a) => a.plane === plane);
}
