"use server";

import { revalidatePath } from "next/cache";
import { connect } from "@/lib/supabase";
import type { Result } from "@/app/shop/[tenant]/actions";

/** Who works at this shop, and when. Separate from taking bookings on purpose. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Conn = Awaited<ReturnType<typeof connect>>;

async function run(
  tenantId: string,
  work: (c: Extract<Conn, { connected: true }>["client"]) => Promise<string>,
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
    revalidatePath(`/shop/${tenantId}/rota`);
    revalidatePath(`/shop/${tenantId}/book`);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function saveBarber(
  tenantId: string,
  name: string,
  active: boolean,
  id: string,
): Promise<Result> {
  return run(tenantId, async (c) => {
    if (name.trim() === "") throw new Error("A barber needs a name.");
    const { error } = await c.rpc("barberos_save_barber", {
      p_tenant: tenantId,
      p_name: name.trim(),
      p_active: active,
      p_id: UUID.test(id) ? id : null,
    });
    if (error) throw new Error(error.message);
    return "Saved.";
  });
}

export async function setHours(
  tenantId: string,
  barberId: string,
  day: number,
  starts: string,
  ends: string,
): Promise<Result> {
  return run(tenantId, async (c) => {
    const off = starts.trim() === "" && ends.trim() === "";
    const { error } = await c.rpc("barberos_set_barber_hours", {
      p_barber: barberId,
      p_day: day,
      p_starts: off ? null : starts,
      p_ends: off ? null : ends,
    });
    if (error) throw new Error(error.message);
    // Two different outcomes, said differently: clearing a day is not saving
    // one, and a screen that says "Saved." for both teaches nothing.
    return off ? "Taken off the rota." : "Saved.";
  });
}

export async function addTimeOff(
  tenantId: string,
  barberId: string,
  date: string,
  reason: string,
): Promise<Result> {
  return run(tenantId, async (c) => {
    if (date.trim() === "") throw new Error("Which day?");
    const { error } = await c.rpc("barberos_set_time_off", {
      p_barber: barberId,
      p_date: date,
      p_reason: reason.trim() === "" ? null : reason.trim(),
      p_starts: null,
      p_ends: null,
    });
    if (error) throw new Error(error.message);
    // Said plainly, because it is the one thing about this control that
    // surprises people.
    return "Marked off. Appointments already booked that day are untouched.";
  });
}

export async function clearTimeOff(tenantId: string, id: string): Promise<Result> {
  return run(tenantId, async (c) => {
    const { error } = await c.rpc("barberos_clear_time_off", { p_id: id });
    if (error) throw new Error(error.message);
    return "Back on the rota.";
  });
}
