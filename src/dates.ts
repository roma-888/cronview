import type { HourFormat } from "./types";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Week rows in the Sunday-based calendar grid for a month (4–6). */
export function weeksInMonthGrid(year: number, month: number): number {
  return Math.ceil((new Date(year, month, 1).getDay() + daysInMonth(year, month)) / 7);
}

/** Add months, clamping the day so Jan 31 + 1 month = Feb 28/29, not Mar 2/3. */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  r.setDate(Math.min(day, daysInMonth(r.getFullYear(), r.getMonth())));
  return r;
}

/** Sunday-based start of week. */
export function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Local-time key like "2026-06-10". */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 24-hour clock hour to its 12-hour equivalent: 0 → 12am, 12 → 12pm, 13 → 1pm. */
export function hour12(h: number): { h: number; suffix: "am" | "pm" } {
  return { h: h % 12 === 0 ? 12 : h % 12, suffix: h < 12 ? "am" : "pm" };
}

export function formatHM(d: Date, fmt: HourFormat = "24"): string {
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (fmt === "12") {
    const { h, suffix } = hour12(d.getHours());
    return `${h}:${mm}${suffix}`;
  }
  return `${String(d.getHours()).padStart(2, "0")}:${mm}`;
}

/** Week-view axis label: "09" or, in 12-hour mode, "9a" / "12p". */
export function formatHourLabel(hour: number, fmt: HourFormat): string {
  if (fmt === "12") {
    const { h, suffix } = hour12(hour);
    return `${h}${suffix[0]}`;
  }
  return String(hour).padStart(2, "0");
}

/** Full-hour range: "13:00–13:59" or, in 12-hour mode, "1:00pm–1:59pm". */
export function formatHourRange(hour: number, fmt: HourFormat): string {
  if (fmt === "12") {
    const { h, suffix } = hour12(hour);
    return `${h}:00${suffix}–${h}:59${suffix}`;
  }
  const hh = String(hour).padStart(2, "0");
  return `${hh}:00–${hh}:59`;
}

export function formatDayLong(d: Date): string {
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    d.getDay()
  ];
  return `${dayName}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Parse "YYYY-MM-DD" as a local date. Returns null if invalid. */
export function parseDateArg(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
  return new Date(year, month, day);
}
