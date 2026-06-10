import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCrontab, jobColor } from "../src/crontab";

const sample = readFileSync(join(import.meta.dir, "../examples/sample.crontab"), "utf8");

describe("parseCrontab", () => {
  test("parses the sample crontab", () => {
    const result = parseCrontab(sample);
    expect(result.jobs).toHaveLength(9);
    expect(result.reboots).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
    expect(result.env).toEqual({
      SHELL: "/bin/zsh",
      PATH: "/usr/local/bin:/usr/bin:/bin",
      MAILTO: "ops@example.com",
    });
  });

  test("skips comments and blank lines", () => {
    const result = parseCrontab("# comment\n\n   \n# another\n");
    expect(result.jobs).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test("normalizes @aliases to 5-field expressions", () => {
    const result = parseCrontab("@daily run-me\n@hourly tick\n@yearly party");
    expect(result.jobs.map((j) => j.expression)).toEqual([
      "0 0 * * *",
      "0 * * * *",
      "0 0 1 1 *",
    ]);
    // Original spelling preserved for display
    expect(result.jobs[0]!.schedule).toBe("@daily");
  });

  test("captures @reboot jobs separately", () => {
    const result = parseCrontab("@reboot /usr/local/bin/start-agent --flag");
    expect(result.jobs).toHaveLength(0);
    expect(result.reboots).toEqual([
      { command: "/usr/local/bin/start-agent --flag", line: 1 },
    ]);
  });

  test("collects warnings for unparsable lines", () => {
    const result = parseCrontab(
      ["99 * * * * bad-minute", "* * * win", "@nonsense cmd", "0 0 * * * good"].join("\n"),
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.command).toBe("good");
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings.map((w) => w.line)).toEqual([1, 2, 3]);
  });

  test("parses env assignments, including quoted values and spaces around =", () => {
    const result = parseCrontab('MAILTO = "a b@example.com"\nEMPTY=\nFOO=bar');
    expect(result.env).toEqual({ MAILTO: "a b@example.com", EMPTY: "", FOO: "bar" });
    expect(result.warnings).toHaveLength(0);
  });

  test("keeps full command including redirections and chained commands", () => {
    const result = parseCrontab("30 2 * * * backup --x >> /var/log/b.log 2>&1\n@weekly a && b");
    expect(result.jobs[0]!.command).toBe("backup --x >> /var/log/b.log 2>&1");
    expect(result.jobs[1]!.command).toBe("a && b");
  });

  test("records 1-based line numbers", () => {
    const result = parseCrontab("# header\n\n0 12 * * * lunch");
    expect(result.jobs[0]!.line).toBe(3);
  });

  test("collapses whitespace in expressions", () => {
    const result = parseCrontab("0   12  *  *  * lunch");
    expect(result.jobs[0]!.expression).toBe("0 12 * * *");
  });

  test("assigns cycling colors", () => {
    expect(jobColor(0)).toBe(jobColor(10));
    expect(jobColor(0)).not.toBe(jobColor(1));
  });
});
