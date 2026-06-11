import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { CronExpressionParser } from "cron-parser";
import type { CronJob, ParseResult, RebootJob, ParseWarning } from "./types";

const ALIASES: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const PALETTE = [
  "#5fd7ff", // cyan
  "#ff87d7", // pink
  "#ffd75f", // gold
  "#87ff87", // green
  "#af87ff", // purple
  "#ff8787", // salmon
  "#5fafff", // blue
  "#d7ff5f", // lime
  "#ffaf5f", // orange
  "#5fffd7", // mint
];

export function jobColor(id: number): string {
  return PALETTE[id % PALETTE.length]!;
}

const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const FIVE_FIELDS = /^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/;

export function parseCrontab(text: string): ParseResult {
  const jobs: CronJob[] = [];
  const reboots: RebootJob[] = [];
  const warnings: ParseWarning[] = [];
  const env: Record<string, string> = {};

  // CRON_TZ applies to the job lines after it (cronie semantics). Plain TZ is
  // left alone — it changes the command's environment, not the schedule.
  let cronTz: string | undefined;

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("@")) {
      const space = line.search(/\s/);
      const alias = space === -1 ? line : line.slice(0, space);
      const command = space === -1 ? "" : line.slice(space).trim();
      if (alias === "@reboot") {
        if (command) reboots.push({ command, line: lineNo });
        else warnings.push({ line: lineNo, text: raw, error: "@reboot with no command" });
        continue;
      }
      const expression = ALIASES[alias];
      if (!expression || !command) {
        warnings.push({
          line: lineNo,
          text: raw,
          error: expression ? `${alias} with no command` : `unknown alias ${alias}`,
        });
        continue;
      }
      addJob(jobs, line.startsWith(alias) ? alias : line, expression, command, lineNo, cronTz);
      continue;
    }

    // Env assignments start with a bare NAME= — schedule lines never do (minute field first).
    const envMatch = ENV_LINE.exec(line);
    if (envMatch) {
      const value = stripQuotes(envMatch[2]!);
      env[envMatch[1]!] = value;
      if (envMatch[1] === "CRON_TZ") {
        // cron-parser doesn't validate zones at parse time; Intl does.
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: value });
          cronTz = value;
        } catch {
          warnings.push({ line: lineNo, text: raw, error: `invalid CRON_TZ timezone "${value}"` });
        }
      }
      continue;
    }

    const fieldsMatch = FIVE_FIELDS.exec(line);
    if (!fieldsMatch) {
      warnings.push({ line: lineNo, text: raw, error: "expected 5 schedule fields + command" });
      continue;
    }
    const expression = fieldsMatch[1]!.replace(/\s+/g, " ");
    const command = fieldsMatch[2]!.trim();
    try {
      CronExpressionParser.parse(expression);
    } catch (err) {
      warnings.push({
        line: lineNo,
        text: raw,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    addJob(jobs, expression, expression, command, lineNo, cronTz);
  }

  return { jobs, reboots, warnings, env };
}

function addJob(
  jobs: CronJob[],
  schedule: string,
  expression: string,
  command: string,
  line: number,
  tz: string | undefined,
): void {
  const id = jobs.length;
  jobs.push({ id, schedule, expression, command, line, color: jobColor(id), tz });
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Read the current user's crontab. Returns '' when no crontab exists, but
 * rethrows other failures so live reload keeps the last good parse instead of
 * mistaking a transient error for an empty crontab.
 */
export function loadUserCrontab(): string {
  try {
    return execFileSync("crontab", ["-l"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const stderr =
      err && typeof err === "object" && "stderr" in err ? String((err as { stderr: unknown }).stderr ?? "") : "";
    if (/no crontab for/i.test(stderr)) return "";
    throw err;
  }
}

export function loadCrontabFile(path: string): string {
  return readFileSync(path, "utf8");
}
