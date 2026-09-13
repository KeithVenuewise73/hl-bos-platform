import { connect } from "@/lib/supabase";
import { BOOKING, myShops } from "@/lib/barberos";
import { listClients } from "@/lib/crm";
import { atShopTime, loadBoard, loadDaySheet, loadSlots, money } from "@/lib/booking";
import { Card, Empty, input } from "@/components/ui";
import { AppointmentActions, PriceGap, SlotButton } from "@/components/BookingScreens";

export const dynamic = "force-dynamic";

/**
 * The day, and the next booking.
 *
 * Server-rendered end to end, including the list of free times: the reason a
 * list is empty arrives in the HTML with the list itself, so there is no state
 * in which the screen has the times and not the explanation.
 */
export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{
    date?: string;
    barber?: string;
    service?: string;
    client?: string;
  }>;
}) {
  const { tenant } = await params;
  const q = await searchParams;

  const state = await connect();
  if (!state.connected) {
    return (
      <Shell tenant={tenant}>
        <Card title="Not signed in">
          <Empty>
            {state.reason}{" "}
            <a href="/login" style={{ color: "#58a6ff" }}>
              Sign in
            </a>
          </Empty>
        </Card>
      </Shell>
    );
  }

  let shops;
  try {
    shops = await myShops(state.client);
  } catch (e) {
    return (
      <Shell tenant={tenant}>
        <Card title="Could not open the book">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }
  const shop = shops.find((s) => s.tenantId === tenant);
  if (shop === undefined) {
    return (
      <Shell tenant={tenant}>
        <Card title="Not your shop">
          <Empty>This account is not a member of that shop.</Empty>
        </Card>
      </Shell>
    );
  }
  if (!shop.capabilities.includes(BOOKING)) {
    return (
      <Shell tenant={tenant} name={shop.shopName}>
        <Card title="The appointment book is not switched on">
          <Empty>
            This shop does not have the booking capability enabled, so there is nothing
            to show. Whoever set up your account can turn it on.
          </Empty>
        </Card>
      </Shell>
    );
  }

  let board, sheet, clients;
  try {
    [board, sheet, clients] = await Promise.all([
      loadBoard(state.client, tenant),
      loadDaySheet(state.client, tenant, q.date),
      listClients(state.client, tenant, ""),
    ]);
  } catch (e) {
    // An empty book and a failed read look identical, and they are not.
    return (
      <Shell tenant={tenant} name={shop.shopName}>
        <Card title="Could not read the book">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }

  const date = sheet?.date ?? q.date ?? "";
  const bookable = board.services.filter((s) => s.bookable);
  const working = board.barbers.filter((b) => b.active);

  // The list of free times is only fetched once a barber and a service have
  // been chosen -- without both there is no length to look for.
  const barberId = q.barber ?? "";
  const serviceId = q.service === undefined ? null : Number(q.service);
  const clientId = q.client ?? "";
  let slots = null;
  let slotError: string | null = null;
  if (
    barberId !== "" &&
    serviceId !== null &&
    Number.isFinite(serviceId) &&
    date !== ""
  ) {
    try {
      slots = await loadSlots(state.client, tenant, barberId, serviceId, date);
    } catch (e) {
      slotError = (e as Error).message;
    }
  }

  return (
    <Shell tenant={tenant} name={shop.shopName}>
      <Card
        title={date}
        sub={`${sheet?.inTheBook ?? 0} in the book${
          (sheet?.cancelled ?? 0) > 0 ? ` · ${sheet?.cancelled} cancelled` : ""
        }${(sheet?.noShows ?? 0) > 0 ? ` · ${sheet?.noShows} no-show` : ""}`}
      >
        <form method="get" style={{ marginBottom: 14 }}>
          <input
            type="date"
            name="date"
            defaultValue={date}
            style={{ ...input, width: 180 }}
          />
        </form>

        {sheet === null || sheet.appointments.length === 0 ? (
          <Empty>Nothing in the book for this day.</Empty>
        ) : (
          sheet.appointments.map((a) => (
            <div
              key={a.id}
              style={{
                borderBottom: "1px solid #21262d",
                padding: "10px 0",
                opacity: a.status === "booked" ? 1 : 0.6,
              }}
            >
              <span style={{ fontSize: 15, color: "#e6edf3" }}>{a.localTime}</span>
              <span style={{ fontSize: 15, color: "#e6edf3", marginLeft: 12 }}>
                {a.clientName}
              </span>
              <span style={{ float: "right", fontSize: 13, color: "#8b949e" }}>
                {a.barberName}
              </span>
              <div style={{ fontSize: 13, color: "#8b949e", marginTop: 2 }}>
                {a.serviceName}
                {a.durationMinutes !== null && ` · ${a.durationMinutes} min`}
                {/* Never a "$0.00" standing in for a price nobody gave. */}
                {a.priceCents === null ? (
                  <span style={{ color: "#d29922" }}> · no price recorded</span>
                ) : (
                  ` · ${money(a.priceCents)}`
                )}
                {a.status !== "booked" && (
                  <span style={{ color: "#6e7681" }}>
                    {" "}
                    · {a.status.replace("_", " ")}
                  </span>
                )}
                {a.cancellationReason !== null && (
                  <span style={{ color: "#6e7681" }}> — {a.cancellationReason}</span>
                )}
              </div>
              {a.clientPhone !== null && (
                <div style={{ fontSize: 13, marginTop: 2 }}>
                  <a
                    href={`tel:${a.clientPhone.replace(/[^\d+]/g, "")}`}
                    style={{ color: "#58a6ff" }}
                  >
                    {a.clientPhone}
                  </a>
                </div>
              )}
              <AppointmentActions
                tenantId={tenant}
                appointment={a}
                mayManage={shop.can.takeBookings}
              />
            </div>
          ))
        )}

        {sheet !== null && sheet.inTheBook > 0 && (
          <p style={{ marginTop: 14, fontSize: 13, color: "#8b949e" }}>
            Expected: {money(sheet.expectedCents)}
            <PriceGap n={sheet.appointmentsWithoutAPrice} />
          </p>
        )}
      </Card>

      {shop.can.takeBookings && (
        <Card title="Take a booking">
          {working.length === 0 || bookable.length === 0 || clients.length === 0 ? (
            <Empty>
              {working.length === 0
                ? "Nobody is on the rota yet, so there is nobody to book with."
                : bookable.length === 0
                  ? "No service has a length recorded, so none of them can be put in the book. Add a duration on the shop page and they will appear here."
                  : "There are no clients yet. An appointment is an appointment with somebody."}
            </Empty>
          ) : (
            <>
              <form method="get">
                <input type="hidden" name="date" value={date} />
                <Row label="Client">
                  <select name="client" defaultValue={clientId} style={input}>
                    <option value="">Choose…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                        {c.phone !== null ? ` · ${c.phone}` : ""}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Barber">
                  <select name="barber" defaultValue={barberId} style={input}>
                    <option value="">Choose…</option>
                    {working.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.displayName}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Service">
                  <select name="service" defaultValue={q.service ?? ""} style={input}>
                    <option value="">Choose…</option>
                    {bookable.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.durationMinutes} min
                        {s.priceCents !== null ? ` · ${money(s.priceCents)}` : ""}
                      </option>
                    ))}
                  </select>
                </Row>
                <button
                  type="submit"
                  style={{ ...input, width: "auto", cursor: "pointer" }}
                >
                  Show free times
                </button>
              </form>

              {board.services.some((s) => !s.bookable) && (
                <p style={{ marginTop: 12, fontSize: 13, color: "#d29922" }}>
                  {board.services.filter((s) => !s.bookable).length} service
                  {board.services.filter((s) => !s.bookable).length === 1
                    ? ""
                    : "s"}{" "}
                  cannot be booked because nobody said how long they take.
                </p>
              )}

              {slotError !== null && (
                <p style={{ marginTop: 14, fontSize: 13, color: "#f85149" }}>
                  {slotError}
                </p>
              )}

              {slots !== null && (
                <div style={{ marginTop: 16 }}>
                  {slots.slots.length === 0 ? (
                    // The sentence, never a bare empty list.
                    <Empty>{slots.basis}</Empty>
                  ) : (
                    <>
                      <p style={{ margin: "0 0 8px", fontSize: 13, color: "#8b949e" }}>
                        {slots.slots.length} free with {slots.barberName} for{" "}
                        {slots.serviceName}
                        {clientId === "" && " — choose a client to book one"}
                      </p>
                      {slots.slots.map((t) =>
                        clientId === "" ? (
                          <span key={t} style={readOnlyChip}>
                            {atShopTime(t, slots.timezone)}
                          </span>
                        ) : (
                          <SlotButton
                            key={t}
                            tenantId={tenant}
                            clientId={clientId}
                            barberId={barberId}
                            serviceId={serviceId!}
                            startsAt={t}
                            label={atShopTime(t, slots.timezone)}
                          />
                        ),
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </Shell>
  );
}

const readOnlyChip: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  margin: "0 6px 6px 0",
  borderRadius: 6,
  border: "1px dashed #2f3742",
  color: "#6e7681",
  fontSize: 13,
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span
        style={{ display: "block", fontSize: 13, color: "#8b949e", marginBottom: 4 }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Shell({
  tenant,
  name,
  children,
}: {
  tenant: string;
  name?: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 64px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 13 }}>
        <a href={`/shop/${tenant}`} style={{ color: "#58a6ff" }}>
          ← {name ?? "Your shop"}
        </a>
        {" · "}
        <a href={`/shop/${tenant}/rota`} style={{ color: "#58a6ff" }}>
          Rota
        </a>
      </p>
      <h1 style={{ fontSize: 20, margin: "0 0 20px" }}>Appointments</h1>
      {children}
    </main>
  );
}
