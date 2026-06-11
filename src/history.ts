import { execFile } from "node:child_process";

/** Evidence that cron started a job. `command` is only known on Linux. */
export interface RunRecord {
  /** Minute precision. */
  at: Date;
  command?: string;
}

export interface RunHistory {
  records: RunRecord[];
  /** Runs scheduled before this can't be judged from the fetched window. */
  coverageStart: Date;
  /** Snapshot time — runs scheduled at or after it can't be judged either. */
  fetchedAt: Date;
  /** Why history is empty or unreliable, for the UI. */
  note?: string;
}

export type RunStatus = "ran" | "missing" | "ambiguous" | "unknown";

/**
 * macOS unified log (`log show --predicate "process == 'cron'" --style syslog`).
 * Modern macOS drops cron's CMD syslog lines, so all we get are per-spawn
 * activity traces — each run is one cron child PID logging a few
 * "Retrieve User by Name" lines. One anonymous record per PID.
 */
export function parseUnifiedLog(text: string): RunRecord[] {
  // Dedupe per PID *and* minute — PIDs recycle within a multi-day window.
  const seen = new Set<string>();
  const records: RunRecord[] = [];
  const re =
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2}\.\d+([+-]\d{4})\s+\S+ cron\[(\d+)\]/;
  for (const line of text.split("\n")) {
    const m = re.exec(line);
    if (!m) continue;
    const [, day, hm, tz, pid] = m as unknown as [string, string, string, string, string];
    const key = `${pid}|${day}T${hm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const at = new Date(`${day}T${hm}:00${tz}`);
    if (!Number.isNaN(at.getTime())) records.push({ at });
  }
  return records;
}

/**
 * Linux `journalctl -o short-iso` (or syslog) CRON lines:
 * "2026-06-10T02:30:01+0200 host CRON[1234]: (user) CMD (command...)".
 */
export function parseSyslogCron(text: string): RunRecord[] {
  const records: RunRecord[] = [];
  const re = /^(\S+) \S+ crond?\[\d+\]: \([^)]+\) CMD \((.*)\)\s*$/i;
  for (const line of text.split("\n")) {
    const m = re.exec(line);
    if (!m) continue;
    const at = new Date(m[1]!);
    if (Number.isNaN(at.getTime())) continue;
    at.setSeconds(0, 0);
    records.push({ at, command: m[2]!.trim() });
  }
  return records;
}

interface MinuteEntry {
  commands: string[];
  anonymous: number;
}

export type HistoryIndex = Map<number, MinuteEntry>;

function minuteKey(at: Date): number {
  return Math.floor(at.getTime() / 60000);
}

export function buildIndex(records: RunRecord[]): HistoryIndex {
  const index: HistoryIndex = new Map();
  for (const r of records) {
    const key = minuteKey(r.at);
    let entry = index.get(key);
    if (!entry) {
      entry = { commands: [], anonymous: 0 };
      index.set(key, entry);
    }
    if (r.command !== undefined) entry.commands.push(r.command);
    else entry.anonymous++;
  }
  return index;
}

/**
 * Judge one scheduled run. `scheduledCount` is how many crontab jobs were due
 * that same minute — anonymous (macOS) records can only confirm a run when
 * they account for every job due then.
 */
export function runStatus(
  index: HistoryIndex,
  at: Date,
  command: string,
  scheduledCount: number,
  coverageStart: Date,
  fetchedAt?: Date,
): RunStatus {
  if (at < coverageStart) return "unknown";
  // The snapshot can't testify about runs scheduled after it was taken.
  if (fetchedAt && at >= fetchedAt) return "unknown";
  const entry = index.get(minuteKey(at));
  if (!entry) return "missing";
  if (entry.commands.includes(command)) return "ran";
  const accounted = entry.commands.length + entry.anonymous;
  if (entry.anonymous > 0 && accounted >= scheduledCount) return "ran";
  return accounted > 0 ? "ambiguous" : "missing";
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** Fetch the last `days` of cron run evidence from the system log. */
export async function fetchHistory(days: number): Promise<RunHistory> {
  const coverageStart = new Date(Date.now() - days * 24 * 3600 * 1000);
  const fetchedAt = new Date();
  try {
    let records: RunRecord[];
    if (process.platform === "darwin") {
      const text = await run("/usr/bin/log", [
        "show",
        "--predicate",
        "process == 'cron'",
        "--style",
        "syslog",
        "--last",
        `${days}d`,
      ]);
      records = parseUnifiedLog(text);
    } else if (process.platform === "linux") {
      const text = await run("journalctl", [
        "-o",
        "short-iso",
        "--no-pager",
        "--since",
        `-${days}d`,
        "SYSLOG_IDENTIFIER=CRON",
        "SYSLOG_IDENTIFIER=cron",
      ]);
      records = parseSyslogCron(text);
    } else {
      return {
        records: [],
        coverageStart,
        fetchedAt,
        note: `run history isn't supported on ${process.platform}`,
      };
    }
    if (records.length === 0) {
      return {
        records,
        coverageStart,
        fetchedAt,
        note: `no cron entries in the system log (last ${days}d)`,
      };
    }
    return { records, coverageStart, fetchedAt };
  } catch {
    return { records: [], coverageStart, fetchedAt, note: "couldn't read the system log" };
  }
}
