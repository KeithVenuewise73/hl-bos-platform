import "server-only";

/**
 * The access decision for every page and every API call, on the server.
 *
 * Who you are: the demo sign-in cookie (no password — this is a local demo).
 * What your company may use: its licensed modules (demo.ts).
 * What your role may do: decided by @hl-bos/tms canOpen/canCall, and then
 * again by the fleet backend itself, which enforces production's role rules.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  canOpen,
  navigation,
  resolveEntitlements,
  type ScreenKey,
  type Screen,
  type Snapshot,
} from "@hl-bos/tms";
import { demo, userById, type DemoCompany, type DemoUser } from "./demo.ts";

export const SESSION_COOKIE = "tms_demo_user";

export interface Ctx {
  user: DemoUser;
  company: DemoCompany;
  nav: Screen[];
  activeModules: string[];
}

export async function currentCtx(): Promise<Ctx | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = userById(id);
  if (!user) return null;
  const company = (await demo()).companies.get(user.company);
  if (!company) return null;
  return {
    user,
    company,
    nav: navigation(company.licensed, user.role),
    activeModules: resolveEntitlements(company.licensed).active,
  };
}

/** For a page: signed in, licensed, right role — or redirect with the reason. */
export async function requireScreen(screen: ScreenKey): Promise<Ctx> {
  const ctx = await currentCtx();
  if (!ctx) redirect("/login");
  const d = canOpen(screen, ctx.company.licensed, ctx.user.role);
  if (!d.allowed) redirect(`/locked?screen=${screen}&reason=${d.reason}`);
  return ctx;
}

export async function snapshotFor(ctx: Ctx): Promise<Snapshot> {
  return (await demo()).backend.call<Snapshot>(ctx.user.id, "snapshot", {
    workspace: ctx.company.id,
  });
}
