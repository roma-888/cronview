import type { CronJob, HourFormat } from "../types";
import type { LogTail, OutputTarget } from "../logs";
import type { RunStatus } from "../history";
import { DAY_NAMES, MONTH_NAMES, formatHM } from "../dates";
import { UI, truncate } from "./theme";

/** Recent scheduled runs judged against the system log, or the load state. */
export type RanInfo =
  | "loading"
  | { items: Array<{ at: Date; status: RunStatus }>; note?: string };

interface LogViewProps {
  job: CronJob;
  target: OutputTarget;
  tail: LogTail | null;
  /** Plain-English schedule, e.g. "every day at 02:30". */
  explanation: string;
  /** Upcoming run times. */
  upcoming: Date[];
  /** Undefined hides run history entirely. */
  ran?: RanInfo;
  hourFormat: HourFormat;
  width: number;
  height: number;
  /** Lines scrolled back from the end of the tail. */
  scroll: number;
}

/**
 * Rows available for log content: everything but the header, the schedule,
 * next-runs and ran lines, the log meta line, and the footer.
 */
export function logContentRows(height: number): number {
  return Math.max(1, height - 6);
}

const STATUS_GLYPH: Record<RunStatus, string> = {
  ran: "✓",
  missing: "✗",
  ambiguous: "?",
  unknown: "·",
};

const STATUS_COLOR: Record<RunStatus, string> = {
  ran: UI.today,
  missing: UI.warn,
  ambiguous: UI.dim,
  unknown: UI.faint,
};

export function LogView({
  job,
  target,
  tail,
  explanation,
  upcoming,
  ran,
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
  const runLabel = (d: Date) =>
    `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[d.getMonth()]!.slice(0, 3)} ${d.getDate()} ${formatHM(d, hourFormat)}`;
  const nextLabel = upcoming.map(runLabel).join(" · ");

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
      <RanLine ran={ran} runLabel={runLabel} width={width} />
      <text fg={UI.dim}>{truncate(` log${meta}`, width - 1)}</text>
      <box style={{ flexDirection: "column", flexGrow: 1, paddingLeft: 1 }}>
        {body.map((line, i) => (
          <text key={i} fg={UI.text}>
            {truncate(line, width - 2)}
          </text>
        ))}
      </box>
      <text fg={UI.dim}>{` ↑↓ scroll · r refresh · q close${position}`}</text>
    </box>
  );
}

function RanLine({
  ran,
  runLabel,
  width,
}: {
  ran: RanInfo | undefined;
  runLabel: (d: Date) => string;
  width: number;
}) {
  if (ran === undefined) {
    return <text fg={UI.faint}>{" ran:  (no system log access)"}</text>;
  }
  if (ran === "loading") {
    return <text fg={UI.dim}>{" ran:  reading the system log…"}</text>;
  }
  if (ran.note || ran.items.length === 0) {
    return <text fg={UI.dim}>{truncate(` ran:  ${ran.note ?? "no past runs"}`, width - 1)}</text>;
  }
  // ✓/✗ marks are judged per scheduled run; "·" means before log coverage.
  // Colored spans can't truncate like plain text, so greedily take items that
  // fit the measured label widths (12-hour labels are wider than 24-hour).
  const spans = [];
  let used = 7; // " ran:  "
  for (let i = 0; i < ran.items.length; i++) {
    const r = ran.items[i]!;
    const label = runLabel(r.at);
    const itemW = 2 + label.length + (i > 0 ? 3 : 0);
    if (i > 0 && used + itemW > width - 1) break;
    used += itemW;
    if (i > 0) spans.push(<span key={`s${i}`} fg={UI.dim}>{" · "}</span>);
    spans.push(
      <span key={`g${i}`} fg={STATUS_COLOR[r.status]}>{`${STATUS_GLYPH[r.status]} `}</span>,
      <span key={`t${i}`} fg={UI.text}>{label}</span>,
    );
  }
  return (
    <text>
      <span fg={UI.dim}>{" ran:  "}</span>
      {spans}
    </text>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
