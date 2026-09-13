"use server";

import { revalidatePath } from "next/cache";
import { connect } from "@/lib/supabase";
import type { Result } from "@/app/shop/[tenant]/actions";

/**
 * Taking, cancelling and finishing appointments.
 *
 * Thin on purpose: the database decides every one of these, and its refusals
 * are already sentences a barber can act on -- "Marcus is already booked at
 * that time", "that appointment is not over yet, so nobody can be marked a
 * no-show". Replacing those with "Something went wrong" would throw away the
 * only part of the answer that helps.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Client = Awaited<ReturnType<typeof connect>>;

async function run(
  tenantId: string,
  work: (c: Extract<Client, { connected: true }>["client"]) => Promise<string>,
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
    revalidatePath(`/shop/${tenantId}/book`);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function takeBooking(
  tenantId: string,
  clientId: string,
  barberId: string,
  serviceId: number,
  startsAt: string,
  notes: string,
): Promise<Result> {
  return run(tenantId, async (c) => {
    if (!UUID.test(clientId)) throw new Error("Choose a client first.");
    if (!UUID.test(barberId)) throw new Error("Choose a barber first.");
    const { error } = await c.rpc("barberos_book", {
      p_tenant: tenantId,
      p_client: clientId,
      p_barber: barberId,
      p_service: serviceId,
      p_starts_at: startsAt,
      p_notes: notes.trim() === "" ? null : notes.trim(),
    });
    if (error) throw new Error(error.message);
    return "Booked.";
  });
}

export async function cancelBooking(
  tenantId: string,
  id: string,
  reason: string,
): Promise<Result> {
  return run(tenantId, async (c) => {
    const res = (await c.rpc("barberos_cancel", {
      p_id: id,
      p_reason: reason.trim() === "" ? null : reason.trim(),
    })) as { data: unknown; error: { message: string } | null };
    if (res.error !== null) throw new Error(res.error.message);
    // The database reports whether anything actually changed, so the screen
    // can tell "cancelled" from "it already was".
    return res.data === true ? "Cancelled." : "That was already cancelled.";
  });
}

export async function completeBooking(
  tenantId: string,
  id: string,
  visit: Record<string, unknown>,
): Promise<Result> {
  return run(tenantId, async (c) => {
    const { error } = await c.rpc("barberos_complete", {
      p_id: id,
      p_visit: visit,
    });
    if (error) throw new Error(error.message);
    // Worth saying out loud: the barber did not type this twice.
    return "Done — and the visit is on their record.";
  });
}

export async function markNoShow(tenantId: string, id: string): Promise<Result> {
  return run(tenantId, async (c) => {
    const { error } = await c.rpc("barberos_no_show", { p_id: id });
    if (error) throw new Error(error.message);
    return "Marked as a no-show.";
  });
}
