"use client";

import { useState, useTransition } from "react";
import { money, type Appointment, type Barber, type TimeOff } from "@/lib/booking";
import {
  cancelBooking,
  completeBooking,
  markNoShow,
  takeBooking,
} from "@/app/shop/[tenant]/book/actions";
import {
  addTimeOff,
  clearTimeOff,
  saveBarber,
  setHours,
} from "@/app/shop/[tenant]/rota/actions";
import type { Result } from "@/app/shop/[tenant]/actions";
import { button, input } from "./ui";

function Note({ r }: { r: Result | null }) {
  if (r === null) return null;
  return (
    <p
      style={{ margin: "10px 0 0", fontSize: 13, color: r.ok ? "#3fb950" : "#f85149" }}
    >
      {r.message}
    </p>
  );
}

/**
 * One free time, as a button that books it.
 *
 * The whole flow is two clicks from the day sheet because that is how long a
 * barber has while somebody is standing at the counter.
 */
export function SlotButton({
  tenantId,
  clientId,
  barberId,
  serviceId,
  startsAt,
  label,
}: {
  tenantId: string;
  clientId: string;
  barberId: string;
  serviceId: number;
  startsAt: string;
  label: string;
}) {
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const [taken, setTaken] = useState(false);

  if (taken) {
    return (
      <span style={{ ...chip, borderColor: "#238636", color: "#3fb950" }}>
        {label} ✓
      </span>
    );
  }
  return (
    <>
      <button
        disabled={busy}
        style={{ ...chip, cursor: busy ? "default" : "pointer" }}
        onClick={() =>
          start(async () => {
            const res = await takeBooking(
              tenantId,
              clientId,
              barberId,
              serviceId,
              startsAt,
              "",
            );
            setR(res);
            if (res.ok) setTaken(true);
          })
        }
      >
        {label}
      </button>
      {r !== null && !r.ok && (
        <span style={{ fontSize: 12, color: "#f85149", marginLeft: 8 }}>
          {r.message}
        </span>
      )}
    </>
  );
}

const chip: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  margin: "0 6px 6px 0",
  borderRadius: 6,
  border: "1px solid #2f3742",
  background: "#0d1117",
  color: "#e6edf3",
  fontSize: 13,
};

/** Cancel, finish, or record that nobody turned up. */
export function AppointmentActions({
  tenantId,
  appointment,
  mayManage,
}: {
  tenantId: string;
  appointment: Appointment;
  mayManage: boolean;
}) {
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);

  // A control that cannot do its job is worse than no control: a barber
  // without booking.manage is shown the appointment and not the buttons.
  if (!mayManage || appointment.status !== "booked") {
    return <Note r={r} />;
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        disabled={busy}
        style={{ ...button(!busy), padding: "5px 10px", fontSize: 13 }}
        onClick={() =>
          start(async () => setR(await completeBooking(tenantId, appointment.id, {})))
        }
      >
        Done
      </button>{" "}
      <button
        disabled={busy}
        style={{ ...button(!busy, "#30363d"), padding: "5px 10px", fontSize: 13 }}
        onClick={() => setAsking((a) => !a)}
      >
        Cancel
      </button>{" "}
      <button
        disabled={busy}
        style={{ ...button(!busy, "#30363d"), padding: "5px 10px", fontSize: 13 }}
        onClick={() =>
          start(async () => setR(await markNoShow(tenantId, appointment.id)))
        }
      >
        No-show
      </button>
      {asking && (
        <div style={{ marginTop: 8 }}>
          <input
            style={input}
            value={reason}
            placeholder="Why? (kept on the record)"
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            disabled={busy}
            style={{ ...button(!busy, "#30363d"), marginTop: 6 }}
            onClick={() =>
              start(async () => {
                setR(await cancelBooking(tenantId, appointment.id, reason));
                setAsking(false);
              })
            }
          >
            Confirm cancellation
          </button>
        </div>
      )}
      <Note r={r} />
    </div>
  );
}

export function AddBarber({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();

  if (!open) {
    return (
      <button style={button(true)} onClick={() => setOpen(true)}>
        Add a barber
      </button>
    );
  }
  return (
    <div>
      <input
        style={input}
        value={name}
        placeholder="Name"
        onChange={(e) => setName(e.target.value)}
      />
      <div style={{ marginTop: 8 }}>
        <button
          disabled={busy}
          style={button(!busy)}
          onClick={() =>
            start(async () => {
              const res = await saveBarber(tenantId, name, true, "");
              setR(res);
              if (res.ok) {
                setName("");
                setOpen(false);
              }
            })
          }
        >
          {busy ? "Saving…" : "Save"}
        </button>{" "}
        <button style={button(true, "#30363d")} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <Note r={r} />
    </div>
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** One barber's working week, plus their days off. */
export function RotaEditor({
  tenantId,
  barber,
  mayManage,
}: {
  tenantId: string;
  barber: Barber;
  mayManage: boolean;
}) {
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const [off, setOff] = useState({ date: "", reason: "" });

  const byDay = new Map(barber.hours.map((h) => [h.day, h]));

  return (
    <div>
      {!barber.hasARota && (
        // The distinction the database keeps and the screen must not lose.
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#d29922" }}>
          Nobody has said when {barber.displayName} works, so no times can be offered
          for them yet. That is not the same as a full book.
        </p>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {DAY_NAMES.map((label, day) => {
            const h = byDay.get(day);
            return (
              <tr key={day}>
                <td style={{ padding: "4px 8px 4px 0", color: "#8b949e", width: 44 }}>
                  {label}
                </td>
                <td style={{ padding: "4px 0" }}>
                  {mayManage ? (
                    <DayRow
                      tenantId={tenantId}
                      barberId={barber.id}
                      day={day}
                      starts={h?.starts.slice(0, 5) ?? ""}
                      ends={h?.ends.slice(0, 5) ?? ""}
                      onDone={setR}
                    />
                  ) : h === undefined ? (
                    <span style={{ color: "#6e7681" }}>not working</span>
                  ) : (
                    <span>
                      {h.starts.slice(0, 5)} – {h.ends.slice(0, 5)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 6 }}>
          Days off coming up
        </div>
        {barber.timeOff.length === 0 ? (
          <div style={{ fontSize: 13, color: "#6e7681" }}>None booked.</div>
        ) : (
          barber.timeOff.map((t: TimeOff) => (
            <div key={t.id} style={{ fontSize: 13, marginBottom: 4 }}>
              {t.onDate}
              {t.reason !== null && (
                <span style={{ color: "#6e7681" }}> — {t.reason}</span>
              )}
              {mayManage && (
                <>
                  {" "}
                  <button
                    disabled={busy}
                    style={{
                      ...button(!busy, "#30363d"),
                      padding: "2px 8px",
                      fontSize: 12,
                    }}
                    onClick={() =>
                      start(async () => setR(await clearTimeOff(tenantId, t.id)))
                    }
                  >
                    Undo
                  </button>
                </>
              )}
            </div>
          ))
        )}
        {mayManage && (
          <div style={{ marginTop: 8 }}>
            <input
              type="date"
              style={{ ...input, width: 170, display: "inline-block" }}
              value={off.date}
              onChange={(e) => setOff({ ...off, date: e.target.value })}
            />{" "}
            <input
              style={{ ...input, width: 190, display: "inline-block" }}
              value={off.reason}
              placeholder="Reason (optional)"
              onChange={(e) => setOff({ ...off, reason: e.target.value })}
            />{" "}
            <button
              disabled={busy}
              style={button(!busy, "#30363d")}
              onClick={() =>
                start(async () => {
                  const res = await addTimeOff(
                    tenantId,
                    barber.id,
                    off.date,
                    off.reason,
                  );
                  setR(res);
                  if (res.ok) setOff({ date: "", reason: "" });
                })
              }
            >
              Mark off
            </button>
          </div>
        )}
      </div>
      <Note r={r} />
    </div>
  );
}

function DayRow({
  tenantId,
  barberId,
  day,
  starts,
  ends,
  onDone,
}: {
  tenantId: string;
  barberId: string;
  day: number;
  starts: string;
  ends: string;
  onDone: (r: Result) => void;
}) {
  const [f, setF] = useState({ starts, ends });
  const [busy, start] = useTransition();
  const changed = f.starts !== starts || f.ends !== ends;

  return (
    <>
      <input
        type="time"
        style={{ ...input, width: 110, display: "inline-block" }}
        value={f.starts}
        onChange={(e) => setF({ ...f, starts: e.target.value })}
      />{" "}
      <input
        type="time"
        style={{ ...input, width: 110, display: "inline-block" }}
        value={f.ends}
        onChange={(e) => setF({ ...f, ends: e.target.value })}
      />{" "}
      <button
        disabled={busy || !changed}
        style={{
          ...button(changed && !busy, "#30363d"),
          padding: "5px 10px",
          fontSize: 12,
        }}
        onClick={() =>
          start(async () =>
            onDone(await setHours(tenantId, barberId, day, f.starts, f.ends)),
          )
        }
      >
        {f.starts === "" && f.ends === "" ? "Clear" : "Save"}
      </button>
    </>
  );
}

/** Shown beside a total, never instead of it. */
export function PriceGap({ n }: { n: number }) {
  if (n === 0) return null;
  return <span style={{ color: "#d29922" }}> · {n} with no price recorded</span>;
}

export { money };
