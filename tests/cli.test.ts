import { describe, expect, test } from "bun:test";
import { CliError, parseArgs } from "../src/cli";

function opts(...argv: string[]) {
  const parsed = parseArgs(argv);
  if (parsed.kind !== "options") throw new Error(`expected options, got ${parsed.kind}`);
  return parsed.options;
}

describe("parseArgs", () => {
  test("defaults: month view, today, 24-hour, no file or editor", () => {
    const o = opts();
    expect(o.view).toBe("month");
    expect(o.hours).toBe("24");
    expect(o.file).toBeUndefined();
    expect(o.editor).toBeUndefined();
  });

  test("--help and --version short-circuit", () => {
    expect(parseArgs(["--help"]).kind).toBe("help");
    expect(parseArgs(["-h"]).kind).toBe("help");
    expect(parseArgs(["--version"]).kind).toBe("version");
  });

  test("collects file, view, date, hours", () => {
    const o = opts("-f", "x.cron", "--view", "week", "--date", "2026-07-01", "--hours", "12");
    expect(o.file).toBe("x.cron");
    expect(o.view).toBe("week");
    expect(o.date.getMonth()).toBe(6);
    expect(o.hours).toBe("12");
  });

  test("--editor stores the command", () => {
    expect(opts("--editor", "nano").editor).toBe("nano");
    expect(opts("--editor", "code -w").editor).toBe("code -w");
  });

  test("--editor requires a value", () => {
    expect(() => parseArgs(["--editor"])).toThrow(CliError);
  });

  test("bad values throw CliError", () => {
    expect(() => parseArgs(["--view", "year"])).toThrow(CliError);
    expect(() => parseArgs(["--date", "tomorrow"])).toThrow(CliError);
    expect(() => parseArgs(["--hours", "13"])).toThrow(CliError);
    expect(() => parseArgs(["--bogus"])).toThrow(CliError);
  });
});
