import "server-only";

/**
 * The access decision for every page and API call, on the server.
 *
 *   who you are         -> the signed session cookie (src/lib/auth.ts)
 *   which company       -> fleet.api 'workspaces' for that user (database)
 *   what it may use     -> entitlements.my_modules (database, HL-BOS billing)
 *   what your role does -> canOpen here for pages; the database again for
 *                          every operation (fleet.api roles + P002 licences)
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  canOpen,
  fromDbModules,
  navigation,
  resolveEntitlements,
  type ModuleKey,
  type Role,
  type Screen,
  type ScreenKey,
  type Snapshot,
  type WorkspaceSummary,
} from "@hl-bos/tms";
import { SESSION_COOKIE, emailOf, readSession } from "./auth.ts";
import { db } from "./db.ts";
import { fleetBackend } from "./fleet.ts";

export interface Ctx {
  user: { id: string; email: string; name: string };
  company: { id: string; name: string; licensed: ModuleKey[] };
  role: Role;
  nav: Screen[];
  activeModules: ModuleKey[];
}

export async function currentCtx(): Promise<Ctx | null> {
  const userId = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const workspaces = await fleetBackend
    .call<WorkspaceSummary[]>(userId, "workspaces")
    .catch(() => []);
  const ws = workspaces[0];
  if (!ws) return null;
  const mods = await db()
    .rows<{ module: string; licensed: boolean }>(
      userId,
      "select * from entitlements.my_modules($1)",
      [ws.id],
    )
    .catch(() => []);
  const licensed = fromDbModules(mods.filter((m) => m.licensed).map((m) => m.module));
  // The sign-in layer's job (in production: the JWT's email claim).
  const email = await emailOf(userId);
  const name = email.split("@")[0]!.replace(/^./, (c) => c.toUpperCase());
  return {
    user: { id: userId, email, name },
    company: { id: ws.id, name: ws.name, licensed },
    role: ws.role,
    nav: navigation(licensed, ws.role),
    activeModules: resolveEntitlements(licensed).active,
  };
}

export async function requireScreen(screen: ScreenKey): Promise<Ctx> {
  const ctx = await currentCtx();
  if (!ctx) redirect("/login");
  const d = canOpen(screen, ctx.company.licensed, ctx.role);
  if (!d.allowed) redirect(`/locked?screen=${screen}&reason=${d.reason}`);
  return ctx;
}

export function fleetCall<T = unknown>(
  ctx: Ctx,
  op: Parameters<typeof fleetBackend.call>[1],
  args: Record<string, unknown> = {},
): Promise<T> {
  return fleetBackend.call<T>(ctx.user.id, op, { ...args, workspace: ctx.company.id });
}

export function snapshotFor(ctx: Ctx): Promise<Snapshot> {
  return fleetCall<Snapshot>(ctx, "snapshot");
}
