import { CronExpressionParser } from "cron-parser";
import { DAY_NAMES, MONTH_NAMES, hour12 } from "./dates";
import type { HourFormat } from "./types";

/**
 * Render a cron expression as plain English, e.g.
 * "every 10 minutes, 09:00–17:59, Mon–Fri" or "Mon, Wed, Fri at 7:30pm".
 * Common shapes read naturally; exotic ones fall back to correct-but-plain
 * clause lists. Returns the raw expression if it doesn't parse.
 */
export function explainSchedule(expression: string, fmt: HourFormat): string {
  let fields;
  try {
    fields = CronExpressionParser.parse(expression).fields;
  } catch {
    return expression;
  }
  const minutes = [...fields.minute.values];
  const hours = [...fields.hour.values];
  const domRaw = [...fields.dayOfMonth.values];
  // cron-parser may report Sunday as both 0 and 7.
  const dows = [...new Set(([...fields.dayOfWeek.values] as number[]).map((d) => d % 7))].sort(
    (a, b) => a - b,
  );
  const months = [...fields.month.values];

  const minFull = minutes.length === 60;
  const hourFull = hours.length === 24;
  const domFull = domRaw.length >= 31;
  const dowFull = dows.length === 7;
  const monthFull = months.length === 12;

  const mm = (m: number) => `:${String(m).padStart(2, "0")}`;

  const dowText = () => {
    if (contiguous(dows) && dows.length >= 3) {
      return `${DAY_NAMES[dows[0]!]}–${DAY_NAMES[dows[dows.length - 1]!]}`;
    }
    return dows.map((d) => DAY_NAMES[d]!).join(", ");
  };

  const domText = () => {
    const nums = domRaw.filter((v) => typeof v === "number") as number[];
    if (nums.length > 4) return `on days ${nums.join(", ")} of the month`;
    const parts = nums.map(ordinal);
    if (domRaw.includes("L" as never)) parts.push("last day");
    return `on the ${joinAnd(parts)}`;
  };

  // Standalone subject: "every day", "Mon–Fri", "on the 1st and 15th",
  // or the honest Vixie OR when both day fields are restricted.
  const dayScope = () => {
    if (!domFull && !dowFull) return `${domText()} or ${dowText()}`;
    if (!dowFull) return dowText();
    if (!domFull) return domText();
    return "every day";
  };

  const monthSuffix = () => {
    if (monthFull) return "";
    const names = months.map((m) => MONTH_NAMES[m - 1]!.slice(0, 3));
    if (contiguous(months) && months.length >= 3) {
      return ` in ${names[0]}–${names[names.length - 1]}`;
    }
    return ` in ${names.join(", ")}`;
  };

  const appendDay = (base: string) => {
    const ds = dayScope();
    return `${base}${ds === "every day" ? "" : `, ${ds}`}${monthSuffix()}`;
  };

  // Shape 1: a single minute — concrete time(s) per day.
  if (!minFull && minutes.length === 1) {
    const m = minutes[0]!;
    if (hours.length === 1) {
      return `${dayScope()} at ${timeOf(hours[0]!, m, fmt)}${monthSuffix()}`;
    }
    if (hourFull) return appendDay(`every hour at ${mm(m)}`);
    const hd = stride(hours, 24);
    if (hd) return appendDay(`every ${hd} hours at ${mm(m)}`);
    if (contiguous(hours)) {
      return appendDay(`every hour at ${mm(m)}, ${hourWindow(hours, fmt)}`);
    }
    if (hours.length <= 4) {
      const times = hours.map((h) => timeOf(h, m, fmt)).join(", ");
      return `${dayScope()} at ${times}${monthSuffix()}`;
    }
    return appendDay(`at ${mm(m)} during hours ${hours.join(", ")}`);
  }

  // Shape 2: recurring minutes — frequency first.
  let freq: string;
  if (minFull) {
    freq = "every minute";
  } else {
    const md = stride(minutes, 60);
    freq = md ? `every ${md} minutes` : `at minutes ${minutes.map(mm).join(", ")}`;
  }
  let scope = "";
  if (!hourFull) {
    const hd = stride(hours, 24);
    scope = contiguous(hours)
      ? `, ${hourWindow(hours, fmt)}`
      : hd
        ? `, every ${hd} hours`
        : `, hours ${hours.join(", ")}`;
  }
  return appendDay(`${freq}${scope}`);
}

function timeOf(h: number, m: number, fmt: HourFormat): string {
  const mm = String(m).padStart(2, "0");
  if (fmt === "12") {
    const { h: hh, suffix } = hour12(h);
    return `${hh}:${mm}${suffix}`;
  }
  return `${String(h).padStart(2, "0")}:${mm}`;
}

/** Contiguous hour set as a window: "09:00–17:59". */
function hourWindow(hours: number[], fmt: HourFormat): string {
  return `${timeOf(hours[0]!, 0, fmt)}–${timeOf(hours[hours.length - 1]!, 59, fmt)}`;
}

/** Uniform step from 0 covering the whole field (an every-n step), else null. */
function stride(values: number[], bound: number): number | null {
  if (values.length < 2 || values[0] !== 0) return null;
  const d = values[1]! - values[0]!;
  if (d <= 1 || values.length !== Math.ceil(bound / d)) return null;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! - values[i - 1]! !== d) return null;
  }
  return d;
}

function contiguous(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) {
    if (values[i]! !== values[i - 1]! + 1) return false;
  }
  return true;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${["st", "nd", "rd"][(n % 10) - 1] ?? "th"}`;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return parts.join(", ");
}
