import { describe, expect, test } from "bun:test";
import { explainSchedule } from "../src/explain";
import { nextRuns, prevRuns } from "../src/schedule";
import { parseCrontab } from "../src/crontab";

describe("explainSchedule (24-hour)", () => {
  const cases: Array<[string, string]> = [
    ["* * * * *", "every minute"],
    ["*/15 * * * *", "every 15 minutes"],
    ["*/10 9-17 * * 1-5", "every 10 minutes, 09:00–17:59, Mon–Fri"],
    ["0 */6 * * *", "every 6 hours at :00"],
    ["30 2 * * *", "every day at 02:30"],
    ["0 0 * * *", "every day at 00:00"],
    ["0 9 * * 1-5", "Mon–Fri at 09:00"],
    ["0 22 * * 0", "Sun at 22:00"],
    ["30 19 * * 1,3,5", "Mon, Wed, Fri at 19:30"],
    ["0 6 1,15 * *", "on the 1st and 15th at 06:00"],
    ["0 0 15 * 1", "on the 15th or Mon at 00:00"],
    ["0 12 * 6 *", "every day at 12:00 in Jun"],
    ["0 9-17 * * *", "every hour at :00, 09:00–17:59"],
    ["0 9,12,15 * * *", "every day at 09:00, 12:00, 15:00"],
  ];
  for (const [expr, english] of cases) {
    test(`${expr} → ${english}`, () => {
      expect(explainSchedule(expr, "24")).toBe(english);
    });
  }
});

describe("explainSchedule (CRON_TZ)", () => {
  test("appends the zone so wall-times aren't misread", () => {
    expect(explainSchedule("30 2 * * *", "24", "America/New_York")).toBe(
      "every day at 02:30 (America/New_York)",
    );
  });
});

describe("explainSchedule (12-hour)", () => {
  test("times follow the clock format", () => {
    expect(explainSchedule("30 19 * * 1,3,5", "12")).toBe("Mon, Wed, Fri at 7:30pm");
    expect(explainSchedule("*/10 9-17 * * 1-5", "12")).toBe(
      "every 10 minutes, 9:00am–5:59pm, Mon–Fri",
    );
  });
});

describe("prevRuns", () => {
  const job = parseCrontab("30 2 * * * backup").jobs[0]!;

  test("returns the previous n occurrences before a given time", () => {
    const from = new Date(2026, 5, 10, 14, 0);
    const runs = prevRuns(job, from, 3);
    expect(runs.map((d) => `${d.getDate()} ${d.getHours()}:${d.getMinutes()}`)).toEqual([
      "10 2:30",
      "9 2:30",
      "8 2:30",
    ]);
  });
});

describe("nextRuns", () => {
  const job = parseCrontab("30 2 * * * backup").jobs[0]!;

  test("returns the next n occurrences from a given time", () => {
    const from = new Date(2026, 5, 10, 14, 0); // Jun 10, 2026 14:00
    const runs = nextRuns(job, from, 3);
    expect(runs.map((d) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}`)).toEqual([
      "6/11 2:30",
      "6/12 2:30",
      "6/13 2:30",
    ]);
  });
});
