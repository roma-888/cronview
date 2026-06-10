import type { CronJob, HourFormat } from "../types";
import type { LogTail, OutputTarget } from "../logs";
import { DAY_NAMES, MONTH_NAMES, formatHM } from "../dates";
import { UI, truncate } from "./theme";

interface LogViewProps {
  job: CronJob;
  target: OutputTarget;
  tail: LogTail | null;
  /** Plain-English schedule, e.g. "every day at 02:30". */
  explanation: string;
  /** Upcoming run times. */
  upcoming: Date[];
  hourFormat: HourFormat;
  width: number;
  height: number;
  /** Lines scrolled back from the end of the tail. */
  scroll: number;
}

/**
 * Rows available for log content: everything but the header, the schedule
 * and next-runs lines, the log meta line, and the footer.
 */
export function logContentRows(height: number): number {
  return Math.max(1, height - 5);
}

export function LogView({
  job,
  target,
  tail,
  explanation,
  upcoming,
  hourFormat,
  width,
  height,
  scroll,
}: LogViewProps) {
  const rows = logContentRows(height);

  let body: string[];
  let position = "";
  if (target.kind === "discard") {
    body = ["This job's output is discarded (redirected to /dev/null)."];
  } else if (target.kind === "mail") {
    body = [
      "No redirect — cron mails this job's output to the local user.",
      "Check /var/mail/$USER, or MAILTO= in the crontab.",
    ];
  } else if (!tail) {
    body = [target.path, "Log file not found — the job may not have run yet."];
  } else if (tail.lines.length === 0) {
    body = [target.path, "Log file is empty."];
  } else {
    const end = tail.lines.length - scroll;
    const start = Math.max(0, end - rows);
    body = tail.lines.slice(start, end);
    position = ` · lines ${start + 1}–${end} of ${tail.lines.length}`;
  }

  const meta =
    target.kind === "file" ? ` · ${target.path}${tail ? ` · ${formatSize(tail.size)}` : ""}` : "";
  const nextLabel = upcoming
    .map(
      (d) =>
        `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[d.getMonth()]!.slice(0, 3)} ${d.getDate()} ${formatHM(d, hourFormat)}`,
    )
    .join(" · ");

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
      <box style={{ height: 1, backgroundColor: UI.headerBg }}>
        <text>
          <span fg={UI.accent}>{" job "}</span>
          <span fg={job.color}>{"● "}</span>
          <span fg={UI.text}>{truncate(job.command, Math.max(8, width - 8))}</span>
        </text>
      </box>
      <text>
        <span fg={UI.dim}>{` ${job.schedule}  —  `}</span>
        <span fg={UI.text}>{truncate(explanation, Math.max(8, width - job.schedule.length - 7))}</span>
      </text>
      <text>
        <span fg={UI.dim}>{" next: "}</span>
        <span fg={UI.text}>{truncate(nextLabel, Math.max(8, width - 8))}</span>
      </text>
      <text fg={UI.dim}>{truncate(` log${meta}`, width - 1)}</text>
      <box style={{ flexDirection: "column", flexGrow: 1, paddingLeft: 1 }}>
        {body.map((line, i) => (
          <text key={i} fg={UI.text}>
            {truncate(line, width - 2)}
          </text>
        ))}
      </box>
      <text fg={UI.dim}>{` ↑↓ scroll · q close${position}`}</text>
    </box>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
