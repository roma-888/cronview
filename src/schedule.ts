import { CronExpressionParser, type CronExpression } from "cron-parser";
import type { CronJob } from "./types";
import { addDays, dateKey, endOfDay, startOfDay } from "./dates";

/** A job's activity on one specific day. */
export interface JobDayInfo {
  job: CronJob;
  /** First run of the day. */
  first: Date;
  /** Total runs on this day. */
  count: number;
  /** Hours of the day (0-23) with at least one run. */
  hours: number[];
  /** Minute pattern within each matching hour. */
  minutes: number[];
}

const exprCache = new Map<string, CronExpression>();

function parsed(expression: string): CronExpression {
  let p = exprCache.get(expression);
  if (!p) {
    p = CronExpressionParser.parse(expression);
    exprCache.set(expression, p);
  }
  return p;
}

function hourValues(expression: string): number[] {
  return [...parsed(expression).fields.hour.values];
}

function minuteValues(expression: string): number[] {
  return [...parsed(expression).fields.minute.values];
}

/**
 * First run of the job on the given day, or null if it doesn't run that day.
 * Uses the cron-parser iterator so day-of-month/day-of-week OR semantics,
 * L modifiers, and month restrictions are all handled for us.
 */
export function firstRunOnDay(job: CronJob, day: Date): Date | null {
  const from = new Date(startOfDay(day).getTime() - 1000);
  try {
    const it = CronExpressionParser.parse(job.expression, { currentDate: from, tz: job.tz });
    const next = it.next().toDate();
    return next <= endOfDay(day) ? next : null;
  } catch {
    // Iterator exhausted (expression never matches again).
    return null;
  }
}

/**
 * Runs per matching day = |minute values| × |hour values|.
 * Field math instead of iteration, so "* * * * *" is 60×24 not 1440 next() calls.
 */
export function runsPerDay(expression: string): number {
  return minuteValues(expression).length * hourValues(expression).length;
}

export function jobDayInfo(job: CronJob, day: Date): JobDayInfo | null {
  const first = firstRunOnDay(job, day);
  if (!first) return null;
  if (job.tz) return tzJobDayInfo(job, day, first);
  return {
    job,
    first,
    count: runsPerDay(job.expression),
    hours: hourValues(job.expression),
    minutes: minuteValues(job.expression),
  };
}

/**
 * Timezone jobs can't use field math: the cron-zone hour fields don't map 1:1
 * onto the viewer's local hours (offsets, and DST days really have 23/25
 * hours). Iterate the day's actual runs instead, bounded by every-minute pace.
 */
function tzJobDayInfo(job: CronJob, day: Date, first: Date): JobDayInfo {
  const end = endOfDay(day);
  const hours = new Set<number>();
  const minutes = new Set<number>();
  let count = 0;
  try {
    const it = CronExpressionParser.parse(job.expression, {
      currentDate: new Date(startOfDay(day).getTime() - 1000),
      tz: job.tz,
    });
    while (count < 25 * 60) {
      const next = it.next().toDate();
      if (next > end) break;
      count++;
      hours.add(next.getHours());
      minutes.add(next.getMinutes());
    }
  } catch {
    // iterator exhausted mid-day
  }
  return {
    job,
    first,
    count,
    hours: [...hours].sort((a, b) => a - b),
    minutes: [...minutes].sort((a, b) => a - b),
  };
}

/**
 * Activity for every job across a range of days.
 * Returns a map of local date key ("2026-06-10") → infos sorted by first run.
 */
export function dayInfosForRange(
  jobs: CronJob[],
  start: Date,
  numDays: number,
): Map<string, JobDayInfo[]> {
  const result = new Map<string, JobDayInfo[]>();
  for (let i = 0; i < numDays; i++) {
    const day = addDays(start, i);
    const infos: JobDayInfo[] = [];
    for (const job of jobs) {
      const info = jobDayInfo(job, day);
      if (info) infos.push(info);
    }
    infos.sort((a, b) => a.first.getTime() - b.first.getTime() || a.job.id - b.job.id);
    result.set(dateKey(day), infos);
  }
  return result;
}

/** Total runs across all jobs for one day's infos. */
export function totalRuns(infos: JobDayInfo[]): number {
  return infos.reduce((sum, i) => sum + i.count, 0);
}

/** Runs of one job within a specific hour (0 if none). */
export function runsInHour(info: JobDayInfo, hour: number): number {
  return info.hours.includes(hour) ? info.minutes.length : 0;
}

/** The next n runs of one job from a given time (fewer if it stops matching). */
export function nextRuns(job: CronJob, from: Date, n: number): Date[] {
  const out: Date[] = [];
  try {
    const it = CronExpressionParser.parse(job.expression, { currentDate: from, tz: job.tz });
    for (let i = 0; i < n; i++) out.push(it.next().toDate());
  } catch {
    // iterator exhausted
  }
  return out;
}

/** The previous n runs of one job before a given time, newest first. */
export function prevRuns(job: CronJob, from: Date, n: number): Date[] {
  const out: Date[] = [];
  try {
    const it = CronExpressionParser.parse(job.expression, { currentDate: from, tz: job.tz });
    for (let i = 0; i < n; i++) out.push(it.prev().toDate());
  } catch {
    // iterator exhausted
  }
  return out;
}

/** Does the job run at exactly this minute? */
export function runsAt(job: CronJob, at: Date): boolean {
  const from = new Date(at.getTime() - 1000);
  try {
    const it = CronExpressionParser.parse(job.expression, { currentDate: from, tz: job.tz });
    return it.next().toDate().getTime() === at.getTime();
  } catch {
    return false;
  }
}

/** Next upcoming run across all jobs, from a given time. */
export function nextRunAcross(jobs: CronJob[], from: Date): { job: CronJob; at: Date } | null {
  let best: { job: CronJob; at: Date } | null = null;
  for (const job of jobs) {
    try {
      const it = CronExpressionParser.parse(job.expression, { currentDate: from, tz: job.tz });
      const at = it.next().toDate();
      if (!best || at < best.at) best = { job, at };
    } catch {
      // never runs again
    }
  }
  return best;
}
