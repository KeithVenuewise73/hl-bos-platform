import { describe, expect, it } from "vitest";
import {
  atShopTime,
  money,
  NO_BASIS_GIVEN,
  toAppointment,
  toBarber,
  toBoard,
  toDaySheet,
  toSlots,
  toStatus,
} from "./booking";

describe("appointment status", () => {
  it("maps the four the database has", () => {
    expect(toStatus("booked")).toBe("booked");
    expect(toStatus("completed")).toBe("completed");
    expect(toStatus("cancelled")).toBe("cancelled");
    expect(toStatus("no_show")).toBe("no_show");
  });

  // Safe direction: an unrecognised status shows somebody as still expected.
  // The other way hides a customer who is about to walk in.
  it("reads anything else as still in the book", () => {
    expect(toStatus("rescheduled")).toBe("booked");
    expect(toStatus(null)).toBe("booked");
    expect(toStatus(7)).toBe("booked");
  });
});

describe("the reason an empty list is empty", () => {
  it("carries the database's own sentence", () => {
    const s = toSlots({
      date: "2026-09-20",
      slots: [],
      basis: "no working hours have been set for this barber yet",
    });
    expect(s?.slots).toEqual([]);
    expect(s?.basis).toBe("no working hours have been set for this barber yet");
  });

  // The whole point of the module's honesty rule. If the reason is lost, the
  // screen must say it is missing -- not invent "fully booked".
  it("never invents one when it is missing", () => {
    expect(toSlots({ date: "2026-09-20", slots: [] })?.basis).toBe(NO_BASIS_GIVEN);
    expect(NO_BASIS_GIVEN).not.toMatch(/booked|available/i);
  });

  it("keeps the times it was given", () => {
    const s = toSlots({
      date: "2026-09-20",
      slot_minutes: 15,
      barber: { display_name: "Marcus" },
      service: { name: "Skin fade", duration_minutes: 30 },
      slots: ["2026-09-20T13:00:00+00:00", "2026-09-20T13:15:00+00:00"],
      basis: "open",
    });
    expect(s?.slots).toHaveLength(2);
    expect(s?.barberName).toBe("Marcus");
    expect(s?.durationMinutes).toBe(30);
    expect(s?.slotMinutes).toBe(15);
  });

  it("drops a slot that is not a string rather than rendering undefined", () => {
    const s = toSlots({ date: "d", slots: ["a", null, 5, "b"], basis: "open" });
    expect(s?.slots).toEqual(["a", "b"]);
  });

  it("is null for something that is not an answer at all", () => {
    expect(toSlots(null)).toBeNull();
    expect(toSlots({ slots: [] })).toBeNull();
  });
});

describe("a barber", () => {
  it("maps the rota", () => {
    const b = toBarber({
      id: "b1",
      display_name: "Marcus",
      active: true,
      has_a_rota: true,
      hours: [{ day_of_week: 2, starts_at: "09:00:00", ends_at: "17:00:00" }],
      time_off: [{ id: "t1", on_date: "2026-09-25", reason: "Dentist" }],
    });
    expect(b?.hours).toEqual([{ day: 2, starts: "09:00:00", ends: "17:00:00" }]);
    expect(b?.timeOff[0]?.reason).toBe("Dentist");
    expect(b?.timeOff[0]?.starts).toBeNull();
  });

  // "Nobody has entered a rota" and "works no days" are the same empty array.
  // Only the flag separates them, and telling a shop the wrong one is how it
  // stops believing the screen.
  it("keeps no-rota apart from works-no-days", () => {
    const never = toBarber({ id: "b", display_name: "New", has_a_rota: false });
    const none = toBarber({
      id: "b",
      display_name: "Old",
      has_a_rota: true,
      hours: [],
    });
    expect(never?.hasARota).toBe(false);
    expect(none?.hasARota).toBe(true);
    expect(never?.hours).toEqual(none?.hours);
  });

  it("reads a missing active flag as retired, not as bookable", () => {
    expect(toBarber({ id: "b", display_name: "X" })?.active).toBe(false);
    expect(toBarber({ id: "b", display_name: "X", active: "yes" })?.active).toBe(false);
  });

  it("is null without an id or a name", () => {
    expect(toBarber({ display_name: "No id" })).toBeNull();
    expect(toBarber({ id: "b" })).toBeNull();
  });

  it("drops an unmappable working day rather than rendering a blank one", () => {
    const b = toBarber({
      id: "b",
      display_name: "X",
      hours: [
        { day_of_week: 1, starts_at: "09:00", ends_at: "17:00" },
        { day_of_week: 2, starts_at: "09:00" },
      ],
    });
    expect(b?.hours).toHaveLength(1);
  });
});

describe("the board", () => {
  const raw = {
    timezone: "America/New_York",
    settings: { slot_minutes: 20, lead_time_minutes: 60, max_days_ahead: 30 },
    barbers: [{ id: "b1", display_name: "Marcus", active: true }],
    services: [
      { id: 1, name: "Skin fade", price_cents: 4000, duration_minutes: 30 },
      { id: 2, name: "Consultation", price_cents: 1000 },
    ],
  };

  it("maps the settings the shop chose", () => {
    const b = toBoard(raw);
    expect(b.settings.slotMinutes).toBe(20);
    expect(b.settings.leadTimeMinutes).toBe(60);
    expect(b.settings.isDefault).toBe(false);
  });

  it("falls back to the module's defaults and says they are defaults", () => {
    const b = toBoard({ settings: { is_default: true } });
    expect(b.settings.slotMinutes).toBe(15);
    expect(b.settings.maxDaysAhead).toBe(60);
    expect(b.settings.isDefault).toBe(true);
  });

  // A service with no duration is real and priced -- it just cannot be put in
  // the book. Dropping it silently would leave the shop wondering where it
  // went; offering it would need a length nobody gave.
  it("keeps an unbookable service and marks it so", () => {
    const b = toBoard(raw);
    expect(b.services).toHaveLength(2);
    expect(b.services[0]?.bookable).toBe(true);
    expect(b.services[1]?.bookable).toBe(false);
    expect(b.services[1]?.durationMinutes).toBeNull();
    expect(b.services[1]?.priceCents).toBe(1000);
  });

  it("derives bookable from the duration rather than trusting the flag", () => {
    const b = toBoard({
      services: [{ id: 3, name: "Lying", bookable: true }],
    });
    expect(b.services[0]?.bookable).toBe(false);
  });

  it("survives a shape it was not expecting", () => {
    expect(toBoard(null).barbers).toEqual([]);
    expect(toBoard("nonsense").services).toEqual([]);
    expect(toBoard(undefined).timezone).toBe("UTC");
  });
});

describe("the day sheet", () => {
  const sheet = {
    date: "2026-09-20",
    timezone: "America/New_York",
    appointments: [
      {
        id: "a1",
        starts_at: "2026-09-20T14:00:00+00:00",
        ends_at: "2026-09-20T14:30:00+00:00",
        local_time: "10:00",
        status: "booked",
        client: { id: "c1", display_name: "Anthony Reid", phone: "716-555" },
        barber: { id: "b1", display_name: "Marcus" },
        service_name: "Skin fade",
        price_cents: 4000,
        duration_minutes: 30,
      },
    ],
    summary: {
      in_the_book: 1,
      expected_cents: 4000,
      appointments_without_a_price: 1,
      cancelled: 2,
      no_shows: 0,
    },
  };

  it("maps a day", () => {
    const d = toDaySheet(sheet);
    expect(d?.appointments).toHaveLength(1);
    expect(d?.appointments[0]?.clientName).toBe("Anthony Reid");
    expect(d?.appointments[0]?.localTime).toBe("10:00");
    expect(d?.inTheBook).toBe(1);
  });

  // The same rule as lifetime value in the client record: a total is never
  // readable without the count of rows that carry no price at all.
  it("carries the count of appointments with no price beside the total", () => {
    const d = toDaySheet(sheet);
    expect(d?.expectedCents).toBe(4000);
    expect(d?.appointmentsWithoutAPrice).toBe(1);
  });

  it("reports cancellations rather than hiding them", () => {
    expect(toDaySheet(sheet)?.cancelled).toBe(2);
  });

  it("is null for something that is not a day", () => {
    expect(toDaySheet(null)).toBeNull();
    expect(toDaySheet({ appointments: [] })).toBeNull();
  });

  it("drops an appointment with no id rather than rendering a ghost", () => {
    const d = toDaySheet({
      date: "d",
      appointments: [{ id: "a" }, { client: { display_name: "Nobody" } }],
    });
    expect(d?.appointments).toHaveLength(1);
  });
});

describe("an appointment", () => {
  it("names somebody rather than rendering an empty row", () => {
    const a = toAppointment({ id: "a1" });
    expect(a?.clientName).toBe("Someone");
    expect(a?.priceCents).toBeNull();
  });

  it("keeps why it was cancelled", () => {
    const a = toAppointment({
      id: "a1",
      status: "cancelled",
      cancellation_reason: "Customer rang",
    });
    expect(a?.status).toBe("cancelled");
    expect(a?.cancellationReason).toBe("Customer rang");
  });
});

describe("times and money", () => {
  it("renders an instant in the shop's own timezone", () => {
    expect(atShopTime("2026-09-20T14:00:00Z", "America/New_York")).toBe("10:00");
    expect(atShopTime("2026-09-20T14:00:00Z", "UTC")).toBe("14:00");
  });

  it("renders nothing rather than the wrong timezone", () => {
    expect(atShopTime("2026-09-20T14:00:00Z", "Mars/Olympus")).toBe("");
    expect(atShopTime("not a date", "UTC")).toBe("");
  });

  it("never renders a missing price as free", () => {
    expect(money(4000)).toBe("$40.00");
    expect(money(null)).toBeNull();
  });
});
