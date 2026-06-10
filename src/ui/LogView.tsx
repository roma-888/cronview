import type { CronJob } from "../types";
import type { LogTail, OutputTarget } from "../logs";
import { UI, truncate } from "./theme";

interface LogViewProps {
  job: CronJob;
  target: OutputTarget;
  tail: LogTail | null;
  width: number;
  height: number;
  /** Lines scrolled back from the end of the tail. */
  scroll: number;
}

/** Rows available for log content: everything but the header and footer. */
export function logContentRows(height: number): number {
  return Math.max(1, height - 2);
}

export function LogView({ job, target, tail, width, height, scroll }: LogViewProps) {
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

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
      <box style={{ height: 1, backgroundColor: UI.headerBg }}>
        <text>
          <span fg={UI.accent}>{" log "}</span>
          <span fg={job.color}>{"● "}</span>
          <span fg={UI.text}>{truncate(job.command, Math.max(8, width - meta.length - 8))}</span>
          <span fg={UI.dim}>{meta}</span>
        </text>
      </box>
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
