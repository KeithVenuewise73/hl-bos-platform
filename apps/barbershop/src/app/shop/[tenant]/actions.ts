"use server";

import { revalidatePath } from "next/cache";
import { connect } from "@/lib/supabase";
import {
  deleteService,
  publish,
  saveService,
  saveSite,
  setHours,
  setLink,
  unpublish,
  type SiteFields,
} from "@/lib/barberos";

/**
 * Everything this app can change, and nothing it decides.
 *
 * Each action is a thin pass-through to the `public.barberos_*` API as the
 * signed-in barber. There is no permission logic here on purpose: the database
 * makes that decision on every call, and an app-side copy of it would be a
 * second opinion that can drift from the real one.
 *
 * WHAT IS NOT THIN is the error handling. The database's message is the most
 * useful sentence this app can show -- "this page cannot be published yet: it
 * is missing a street address" tells a barber exactly what to do next, and
 * replacing it with "Something went wrong" would throw that away.
 */

export interface Result {
  ok: boolean;
  message: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run(
  tenantId: string,
  work: (client: Parameters<typeof saveSite>[0]) => Promise<string>,
): Promise<Result> {
  if (!UUID.test(tenantId)) {
    return { ok: false, message: "That is not a shop this app recognises." };
  }
  const state = await connect();
  if (!state.connected) {
    return { ok: false, message: `${state.reason} Sign in again to continue.` };
  }
  try {
    const message = await work(state.client);
    revalidatePath(`/shop/${tenantId}`);
    revalidatePath("/");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function saveDetails(
  tenantId: string,
  fields: SiteFields,
): Promise<Result> {
  return run(tenantId, async (client) => {
    if (fields.slug.trim() === "") {
      throw new Error("Your page needs a web address before it can be saved.");
    }
    await saveSite(client, tenantId, fields);
    return "Saved.";
  });
}

export async function saveDay(
  tenantId: string,
  day: number,
  closed: boolean,
  opens: string,
  closes: string,
): Promise<Result> {
  return run(tenantId, async (client) => {
    if (!closed && (opens === "" || closes === "")) {
      throw new Error("An open day needs both an opening and a closing time.");
    }
    await setHours(client, tenantId, {
      day,
      closed,
      opens: closed ? null : opens,
      closes: closed ? null : closes,
    });
    return "Hours saved.";
  });
}

export async function saveOneService(
  tenantId: string,
  name: string,
  priceCents: number | null,
  durationMinutes: number | null,
): Promise<Result> {
  return run(tenantId, async (client) => {
    if (name.trim() === "") throw new Error("A service needs a name.");
    await saveService(client, tenantId, {
      name: name.trim(),
      priceCents,
      durationMinutes,
    });
    return "Service saved.";
  });
}

export async function removeService(tenantId: string, name: string): Promise<Result> {
  return run(tenantId, async (client) => {
    const gone = await deleteService(client, tenantId, name);
    // The API reports whether anything was actually removed, so this does not
    // claim success for a no-op.
    return gone ? "Removed." : "There was nothing by that name to remove.";
  });
}

export async function saveLink(
  tenantId: string,
  kind: string,
  url: string,
): Promise<Result> {
  return run(tenantId, async (client) => {
    const trimmed = url.trim();
    await setLink(client, tenantId, kind, trimmed === "" ? null : trimmed);
    return trimmed === "" ? "Link removed." : "Link saved.";
  });
}

export async function publishPage(tenantId: string): Promise<Result> {
  return run(tenantId, async (client) => {
    await publish(client, tenantId);
    return "Your page is on the internet.";
  });
}

export async function unpublishPage(tenantId: string): Promise<Result> {
  return run(tenantId, async (client) => {
    await unpublish(client, tenantId);
    return "Your page has been taken down.";
  });
}
