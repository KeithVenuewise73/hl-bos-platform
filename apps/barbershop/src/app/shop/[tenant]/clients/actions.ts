"use server";

import { revalidatePath } from "next/cache";
import { connect } from "@/lib/supabase";
import { recordVisit, saveClient } from "@/lib/crm";
import type { Result } from "@/app/shop/[tenant]/actions";

/**
 * Adding a client, and recording a cut.
 *
 * Thin, like the page actions: the database decides. What is not thin is the
 * error handling -- "a top guard on a scissor cut is a contradiction" is the
 * database telling a barber exactly what it would not let them say, and that
 * sentence is worth more than "Something went wrong".
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run(
  tenantId: string,
  work: (client: Parameters<typeof saveClient>[0]) => Promise<string>,
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
    revalidatePath(`/shop/${tenantId}/clients`);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function addClient(
  tenantId: string,
  name: string,
  phone: string,
  email: string,
  notes: string,
): Promise<Result> {
  return run(tenantId, async (client) => {
    if (name.trim() === "") throw new Error("A client needs a name.");
    const blank = (s: string) => (s.trim() === "" ? null : s.trim());
    await saveClient(client, tenantId, {
      name: name.trim(),
      phone: blank(phone),
      email: blank(email),
      notes: blank(notes),
    });
    // Matched on phone inside the database, so this is "saved" rather than
    // "added": the same regular written twice updates rather than duplicating.
    return "Saved.";
  });
}

export async function addVisit(
  tenantId: string,
  clientId: string,
  visit: Record<string, unknown>,
): Promise<Result> {
  return run(tenantId, async (client) => {
    if (!UUID.test(clientId)) throw new Error("That is not a client.");
    await recordVisit(client, tenantId, clientId, visit);
    revalidatePath(`/shop/${tenantId}/clients/${clientId}`);
    return "Visit recorded.";
  });
}
