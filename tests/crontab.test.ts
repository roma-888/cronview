import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeResults, parseCrontab, jobColor } from "../src/crontab";

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

describe("CRON_TZ", () => {
  test("applies to jobs after the line, not before", () => {
    const r = parseCrontab(
      ["0 9 * * * before", "CRON_TZ=America/New_York", "0 9 * * * after"].join("\n"),
    );
    expect(r.jobs[0]!.tz).toBeUndefined();
    expect(r.jobs[1]!.tz).toBe("America/New_York");
    expect(r.env.CRON_TZ).toBe("America/New_York");
  });

  test("invalid timezone becomes a warning and is ignored", () => {
    const r = parseCrontab(["CRON_TZ=Mars/Olympus", "0 9 * * * job"].join("\n"));
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.error).toContain("CRON_TZ");
    expect(r.jobs[0]!.tz).toBeUndefined();
  });

  test("plain TZ does not affect scheduling", () => {
    const r = parseCrontab(["TZ=UTC", "0 9 * * * job"].join("\n"));
    expect(r.jobs[0]!.tz).toBeUndefined();
  });
});

describe("parseCrontab (system format)", () => {
  test("six fields: run-as user sits between schedule and command", () => {
    const r = parseCrontab("30 2 * * * root /usr/local/bin/backup.sh --full", {
      system: true,
      source: "/etc/crontab",
    });
    expect(r.jobs).toHaveLength(1);
    expect(r.jobs[0]).toMatchObject({
      expression: "30 2 * * *",
      user: "root",
      command: "/usr/local/bin/backup.sh --full",
      source: "/etc/crontab",
    });
  });

  test("@alias lines also carry a user", () => {
    const r = parseCrontab("@daily www-data /usr/bin/cleanup", { system: true });
    expect(r.jobs[0]).toMatchObject({
      expression: "0 0 * * *",
      user: "www-data",
      command: "/usr/bin/cleanup",
    });
  });

  test("a user with no command is a warning", () => {
    const r = parseCrontab("30 2 * * * root", { system: true });
    expect(r.jobs).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
  });

  test("@reboot in system format strips the user from the command", () => {
    const r = parseCrontab("@reboot root /sbin/start-agent", { system: true });
    expect(r.reboots[0]!.command).toBe("/sbin/start-agent");
  });

  test("personal format is unaffected: no user field", () => {
    const r = parseCrontab("30 2 * * * backup --full");
    expect(r.jobs[0]!.user).toBeUndefined();
    expect(r.jobs[0]!.command).toBe("backup --full");
  });
});

describe("mergeResults", () => {
  test("re-ids jobs across sources and keeps source labels", () => {
    const mine = parseCrontab("0 9 * * * my-job");
    const sys = parseCrontab("30 2 * * * root sys-job", { system: true, source: "/etc/crontab" });
    const m = mergeResults([mine, sys]);
    expect(m.jobs.map((j) => j.id)).toEqual([0, 1]);
    expect(m.jobs[0]!.source).toBeUndefined();
    expect(m.jobs[1]!.source).toBe("/etc/crontab");
    expect(m.jobs[0]!.color).not.toBe(m.jobs[1]!.color);
  });

  test("CRON_TZ stays scoped to its own file", () => {
    const mine = parseCrontab("CRON_TZ=UTC\n0 9 * * * tz-job");
    const sys = parseCrontab("0 9 * * * root plain-job", { system: true });
    const m = mergeResults([mine, sys]);
    expect(m.jobs[0]!.tz).toBe("UTC");
    expect(m.jobs[1]!.tz).toBeUndefined();
  });

  test("warnings and reboots concatenate; first source's env wins", () => {
    const a = parseCrontab("HOME=/Users/me\nbadline\n@reboot mine");
    const b = parseCrontab("HOME=/root\n@reboot root sys", { system: true });
    const m = mergeResults([a, b]);
    expect(m.warnings).toHaveLength(1);
    expect(m.reboots).toHaveLength(2);
    expect(m.env.HOME).toBe("/Users/me");
  });
});
