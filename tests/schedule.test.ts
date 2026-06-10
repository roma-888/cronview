import { describe, expect, test } from "bun:test";
import type { CronJob } from "../src/types";
import {
  dayInfosForRange,
  firstRunOnDay,
  jobDayInfo,
  nextRunAcross,
  runsInHour,
  runsPerDay,
  totalRuns,
} from "../src/schedule";
import { dateKey } from "../src/dates";

function job(expression: string, id = 0): CronJob {
  return { id, schedule: expression, expression, command: `cmd-${id}`, line: id + 1, color: "#fff" };
}

// 2026-06-10 is a Wednesday; 2026-06-08 a Monday; 2026-06-07 a Sunday.
const wed = new Date(2026, 5, 10);
const mon = new Date(2026, 5, 8);
const sun = new Date(2026, 5, 7);

describe("firstRunOnDay", () => {
  test("weekday-restricted job runs Monday, not Sunday", () => {
    const j = job("0 9 * * 1-5");
    expect(firstRunOnDay(j, mon)?.getHours()).toBe(9);
    expect(firstRunOnDay(j, sun)).toBeNull();
  });

  test("includes a midnight run (00:00 belongs to the day)", () => {
    const j = job("0 0 * * *");
    const first = firstRunOnDay(j, wed);
    expect(first?.getHours()).toBe(0);
    expect(first?.getMinutes()).toBe(0);
    expect(first && dateKey(first)).toBe("2026-06-10");
  });

  test("day-of-month restriction", () => {
    const j = job("0 0 1 * *");
    expect(firstRunOnDay(j, new Date(2026, 6, 1))).not.toBeNull();
    expect(firstRunOnDay(j, wed)).toBeNull();
  });

  test("dom/dow are OR'd when both restricted (vixie cron semantics)", () => {
    // Runs on the 1st of the month AND on every Monday.
    const j = job("0 0 1 * 1");
    expect(firstRunOnDay(j, mon)).not.toBeNull(); // Monday the 8th
    expect(firstRunOnDay(j, new Date(2026, 6, 1))).not.toBeNull(); // Wed July 1st
    expect(firstRunOnDay(j, wed)).toBeNull(); // Wed the 10th: neither
  });
});

describe("runsPerDay", () => {
  test("every 15 minutes → 96 runs", () => {
    expect(runsPerDay("*/15 * * * *")).toBe(96);
  });

  test("every minute → 1440 runs", () => {
    expect(runsPerDay("* * * * *")).toBe(1440);
  });

  test("single daily run → 1", () => {
    expect(runsPerDay("30 2 * * *")).toBe(1);
  });

  test("business hours quarter-hourly → 4 × 9", () => {
    expect(runsPerDay("*/15 9-17 * * *")).toBe(36);
  });
});

describe("jobDayInfo", () => {
  test("reports hours and minutes patterns", () => {
    const info = jobDayInfo(job("0,30 6,18 * * *"), wed);
    expect(info).not.toBeNull();
    expect(info!.count).toBe(4);
    expect(info!.hours).toEqual([6, 18]);
    expect(info!.minutes).toEqual([0, 30]);
    expect(runsInHour(info!, 6)).toBe(2);
    expect(runsInHour(info!, 7)).toBe(0);
  });
});

describe("dayInfosForRange", () => {
  test("maps a week of activity, sorted by first run", () => {
    const jobs = [job("0 12 * * *", 0), job("0 6 * * 3", 1)]; // noon daily; 6am Wednesdays
    const map = dayInfosForRange(jobs, sun, 7);
    expect(map.size).toBe(7);
    const wednesday = map.get("2026-06-10")!;
    expect(wednesday.map((i) => i.job.id)).toEqual([1, 0]); // 6am before noon
    const sunday = map.get("2026-06-07")!;
    expect(sunday.map((i) => i.job.id)).toEqual([0]);
    expect(totalRuns(wednesday)).toBe(2);
  });

  test("handles month boundaries", () => {
    const jobs = [job("0 0 1 * *")]; // first of month
    const map = dayInfosForRange(jobs, new Date(2026, 5, 28), 5); // Jun 28 – Jul 2
    expect(map.get("2026-06-30")!).toHaveLength(0);
    expect(map.get("2026-07-01")!).toHaveLength(1);
  });
});

describe("nextRunAcross", () => {
  test("finds the soonest job", () => {
    const jobs = [job("0 23 * * *", 0), job("30 8 * * *", 1)];
    const next = nextRunAcross(jobs, new Date(2026, 5, 10, 7, 0));
    expect(next!.job.id).toBe(1);
    expect(next!.at.getHours()).toBe(8);
  });
});

describe("CRON_TZ scheduling", () => {
  // bun:test pins TZ=UTC, so a non-UTC cron zone makes tz handling observable:
  // noon in New York (EDT, UTC-4 in June) is 16:00 UTC.
  const nyNoon: CronJob = {
    id: 0,
    schedule: "0 12 * * *",
    expression: "0 12 * * *",
    command: "ny-job",
    line: 1,
    color: "#fff",
    tz: "America/New_York",
  };
  const june10 = new Date(2026, 5, 10);

  test("runs are computed in the job's timezone, returned as absolute times", () => {
    const first = firstRunOnDay(nyNoon, june10);
    expect(first).not.toBeNull();
    expect(first!.getTime()).toBe(Date.UTC(2026, 5, 10, 16, 0));
  });

  test("day info for tz jobs reports viewer-local hours", () => {
    const info = jobDayInfo(nyNoon, june10);
    expect(info).not.toBeNull();
    expect(info!.count).toBe(1);
    expect(info!.hours).toEqual([16]); // viewer (UTC) hour, not the cron-zone hour 12
    expect(info!.minutes).toEqual([0]);
  });
});
