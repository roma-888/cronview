import { describe, expect, test } from "bun:test";
import { buildIndex, parseSyslogCron, parseUnifiedLog, runStatus } from "../src/history";

// Real shape of `log show --predicate "process == 'cron'" --style syslog` on macOS:
// no CMD lines, just per-spawn activity traces (3 lines per run, one PID per run).
const MACOS_LOG = `Timestamp                       (process)[PID]
2026-06-10 16:30:00.178540-0400  localhost cron[18993]: (libsystem_info.dylib) Created Activity ID: 0x2f72de0, Description: Retrieve User by Name
2026-06-10 16:30:00.179395-0400  localhost cron[18993]: (libsystem_info.dylib) Created Activity ID: 0x2f72de1, Description: Retrieve User by Name
2026-06-10 16:30:00.179486-0400  localhost cron[18993]: (libsystem_info.dylib) Created Activity ID: 0x2f72de2, Description: Resolve user group list
2026-06-10 16:40:00.628588-0400  localhost cron[22061]: (libsystem_info.dylib) Created Activity ID: 0x2f836a0, Description: Retrieve User by Name
2026-06-10 16:40:00.629379-0400  localhost cron[22061]: (libsystem_info.dylib) Created Activity ID: 0x2f836a1, Description: Retrieve User by Name
`;

// journalctl -o short-iso on Linux: attributed CMD lines plus session noise.
const LINUX_LOG = `2026-06-10T02:30:01+0200 myhost CRON[1234]: (roma) CMD (backup --incremental >> /var/log/backup.log 2>&1)
2026-06-10T02:30:01+0200 myhost CRON[1234]: pam_unix(cron:session): session opened for user roma(uid=501) by (uid=0)
2026-06-10T09:00:01+0200 myhost CRON[2345]: (roma) CMD (echo 'report' > /dev/null)
`;

describe("parseUnifiedLog (macOS)", () => {
  test("a recycled PID on a different minute is a separate run", () => {
    const recycled = `2026-06-08 02:30:00.100000-0400  localhost cron[5555]: (libsystem_info.dylib) Created Activity ID: 0x1, Description: Retrieve User by Name
2026-06-10 02:30:00.100000-0400  localhost cron[5555]: (libsystem_info.dylib) Created Activity ID: 0x2, Description: Retrieve User by Name
`;
    expect(parseUnifiedLog(recycled).length).toBe(2);
  });

  test("one anonymous record per cron PID, minute precision", () => {
    const records = parseUnifiedLog(MACOS_LOG);
    expect(records.length).toBe(2);
    expect(records[0]!.command).toBeUndefined();
    expect(records[0]!.at.getMinutes()).toBe(30);
    expect(records[0]!.at.getSeconds()).toBe(0);
    expect(records[1]!.at.getMinutes()).toBe(40);
  });
});

describe("parseSyslogCron (Linux)", () => {
  test("extracts command and time from CMD lines, ignores session noise", () => {
    const records = parseSyslogCron(LINUX_LOG);
    expect(records.length).toBe(2);
    expect(records[0]!.command).toBe("backup --incremental >> /var/log/backup.log 2>&1");
    expect(records[0]!.at.getMinutes()).toBe(30);
    expect(records[1]!.command).toBe("echo 'report' > /dev/null");
  });
});

describe("runStatus", () => {
  const t = (h: number, m: number) => new Date(2026, 5, 10, h, m);
  const coverageStart = new Date(2026, 5, 8);
  const index = buildIndex([
    { at: t(2, 30), command: "backup --full" },
    { at: t(9, 0) }, // anonymous (macOS-style)
    { at: t(12, 0) },
  ]);

  test("exact command match is ran", () => {
    expect(runStatus(index, t(2, 30), "backup --full", 2, coverageStart)).toBe("ran");
  });

  test("no record at that minute is missing", () => {
    expect(runStatus(index, t(3, 0), "backup --full", 1, coverageStart)).toBe("missing");
  });

  test("enough anonymous records covers all scheduled jobs", () => {
    expect(runStatus(index, t(9, 0), "anything", 1, coverageStart)).toBe("ran");
  });

  test("fewer anonymous records than scheduled jobs is ambiguous", () => {
    expect(runStatus(index, t(12, 0), "anything", 2, coverageStart)).toBe("ambiguous");
  });

  test("before history coverage is unknown", () => {
    expect(runStatus(index, new Date(2026, 5, 7, 2, 30), "backup --full", 1, coverageStart)).toBe(
      "unknown",
    );
  });

  test("at or after the fetch time is unknown, not missing", () => {
    const fetchedAt = new Date(2026, 5, 10, 12, 0);
    // The snapshot can't know about runs scheduled after it was taken.
    expect(runStatus(index, new Date(2026, 5, 10, 13, 0), "x", 1, coverageStart, fetchedAt)).toBe(
      "unknown",
    );
    expect(runStatus(index, fetchedAt, "x", 1, coverageStart, fetchedAt)).toBe("unknown");
  });
});
