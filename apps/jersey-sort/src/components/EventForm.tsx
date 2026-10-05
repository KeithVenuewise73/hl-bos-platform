import type { EventRow } from "@/lib/repo/events.ts";

const SPORTS = [
  "Football",
  "Basketball",
  "Soccer",
  "Baseball",
  "Softball",
  "Lacrosse",
  "Hockey",
  "Volleyball",
  "Track & Field",
  "Wrestling",
  "Other",
];

export function EventForm({
  action,
  event,
  submit,
}: {
  action: (f: FormData) => Promise<void>;
  event?: EventRow;
  submit: string;
}) {
  return (
    <form action={action} className="card grid gap-4 p-5 sm:grid-cols-2">
      {event ? <input type="hidden" name="id" value={event.id} /> : null}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="name">
          Event name
        </label>
        <input
          className="input"
          id="name"
          name="name"
          required
          defaultValue={event?.name}
          placeholder="West Seneca vs Orchard Park"
        />
      </div>
      <div>
        <label className="label" htmlFor="sport">
          Sport
        </label>
        <select
          className="input"
          id="sport"
          name="sport"
          required
          defaultValue={event?.sport ?? "Football"}
        >
          {SPORTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="date">
          Event date
        </label>
        <input
          className="input"
          id="date"
          name="date"
          type="date"
          required
          defaultValue={event?.event_date}
        />
      </div>
      <div>
        <label className="label" htmlFor="team">
          Team name
        </label>
        <input
          className="input"
          id="team"
          name="team"
          required
          defaultValue={event?.team_name}
          placeholder="West Seneca"
        />
      </div>
      <div>
        <label className="label" htmlFor="opponent">
          Opponent
        </label>
        <input
          className="input"
          id="opponent"
          name="opponent"
          defaultValue={event?.opponent ?? ""}
          placeholder="Orchard Park"
        />
      </div>
      <div>
        <label className="label" htmlFor="location">
          Location
        </label>
        <input
          className="input"
          id="location"
          name="location"
          defaultValue={event?.location ?? ""}
        />
      </div>
      <div>
        <label className="label" htmlFor="season">
          Season
        </label>
        <input
          className="input"
          id="season"
          name="season"
          defaultValue={event?.season_name ?? ""}
          placeholder="2026 (defaults to the event's year)"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">
          Notes (optional)
        </label>
        <textarea
          className="input"
          id="notes"
          name="notes"
          rows={2}
          defaultValue={event?.notes ?? ""}
        />
      </div>
      <div className="sm:col-span-2">
        <button className="btn-primary" type="submit">
          {submit}
        </button>
      </div>
    </form>
  );
}
