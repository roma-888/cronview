import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  dateKey,
  daysInMonth,
  endOfDay,
  formatHM,
  isSameDay,
  parseDateArg,
  startOfDay,
  startOfWeek,
} from "../src/dates";

describe("dates", () => {
  test("startOfDay / endOfDay bracket the day", () => {
    const d = new Date(2026, 5, 10, 14, 30, 45);
    expect(startOfDay(d).getHours()).toBe(0);
    expect(endOfDay(d).getHours()).toBe(23);
    expect(isSameDay(startOfDay(d), endOfDay(d))).toBe(true);
  });

  test("addDays crosses month boundaries", () => {
    expect(dateKey(addDays(new Date(2026, 5, 30), 1))).toBe("2026-07-01");
    expect(dateKey(addDays(new Date(2026, 6, 1), -1))).toBe("2026-06-30");
  });

  test("addMonths clamps the day", () => {
    expect(dateKey(addMonths(new Date(2026, 0, 31), 1))).toBe("2026-02-28");
    expect(dateKey(addMonths(new Date(2024, 0, 31), 1))).toBe("2024-02-29"); // leap year
    expect(dateKey(addMonths(new Date(2026, 5, 15), -1))).toBe("2026-05-15");
  });

  test("startOfWeek is the preceding Sunday", () => {
    expect(dateKey(startOfWeek(new Date(2026, 5, 10)))).toBe("2026-06-07"); // Wed → Sun
    expect(dateKey(startOfWeek(new Date(2026, 5, 7)))).toBe("2026-06-07"); // Sun → itself
  });

  test("daysInMonth", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2026, 11)).toBe(31);
  });

  test("formatHM pads", () => {
    expect(formatHM(new Date(2026, 5, 10, 9, 5))).toBe("09:05");
  });

  test("parseDateArg validates", () => {
    expect(dateKey(parseDateArg("2026-07-01")!)).toBe("2026-07-01");
    expect(parseDateArg("2026-02-30")).toBeNull();
    expect(parseDateArg("not-a-date")).toBeNull();
    expect(parseDateArg("2026-13-01")).toBeNull();
  });
});
