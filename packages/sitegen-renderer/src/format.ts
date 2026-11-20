import { DAYS, type Day, type HoursEntry } from "@hl-bos/sitegen-spec";

export const DAY_NAMES: Record<Day, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** "13:30" -> "1:30 PM". */
export function formatTime(t: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Whole-dollar prices drop the cents: 3000 -> "$30", 3050 -> "$30.50". v1 specs are USD. */
export function formatPrice(cents: number): string {
  const dollars = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = cents % 100;
  return rest === 0 ? `$${dollars}` : `$${dollars}.${String(rest).padStart(2, "0")}`;
}

export const sortHours = (hours: readonly HoursEntry[]): HoursEntry[] =>
  [...hours].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));

/** Escape for the JSON-LD <script>: nothing in the JSON can close the tag or start markup. */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll(String.fromCharCode(0x2028), "\\u2028")
    .replaceAll(String.fromCharCode(0x2029), "\\u2029");
}
