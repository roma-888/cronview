import type { JobDayInfo } from "../schedule";
import { runsInHour, totalRuns } from "../schedule";
import { formatDayLong, formatHM } from "../dates";
import type { ViewMode } from "../types";
import { UI, pad, truncate } from "./theme";

interface DetailPaneProps {
  infos: JobDayInfo[];
  cursor: Date;
  cursorHour: number;
  view: ViewMode;
  width: number;
  /** Total rows available including the title row. */
  height: number;
  crontabEmpty: boolean;
}

export function DetailPane({
  infos,
  cursor,
  cursorHour,
  view,
  width,
  height,
  crontabEmpty,
}: DetailPaneProps) {
  const shown = view === "week" ? infos.filter((i) => runsInHour(i, cursorHour) > 0) : infos;

  const hourLabel = `${String(cursorHour).padStart(2, "0")}:00–${String(cursorHour).padStart(2, "0")}:59`;
  const scope = view === "week" ? ` · ${hourLabel}` : "";
  const runs = view === "week"
    ? shown.reduce((sum, i) => sum + runsInHour(i, cursorHour), 0)
    : totalRuns(shown);
  const summary =
    shown.length > 0
      ? ` — ${shown.length} job${shown.length === 1 ? "" : "s"}, ${runs} run${runs === 1 ? "" : "s"}`
      : "";

  // Reserve rows for the top border, the title, and a possible "+n more" line.
  const maxJobs = Math.max(1, height - 3);
  const visible = shown.slice(0, maxJobs);
  const hidden = shown.length - visible.length;

  return (
    <box
      style={{
        flexDirection: "column",
        height,
        border: ["top"],
        borderColor: UI.faint,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text>
        <span fg={UI.accent}>{formatDayLong(cursor)}</span>
        <span fg={UI.dim}>
          {scope}
          {summary}
        </span>
      </text>
      {visible.length === 0 ? (
        <text fg={UI.dim}>
          {crontabEmpty
            ? "No cron jobs found. Try: cronview --file examples/sample.crontab"
            : view === "week"
              ? `No runs between ${hourLabel}.`
              : "No runs on this day."}
        </text>
      ) : (
        visible.map((info) => (
          <JobLine key={info.job.id} info={info} view={view} cursorHour={cursorHour} width={width} />
        ))
      )}
      {hidden > 0 ? <text fg={UI.dim}>{`  … +${hidden} more`}</text> : null}
    </box>
  );
}

function JobLine({
  info,
  view,
  cursorHour,
  width,
}: {
  info: JobDayInfo;
  view: ViewMode;
  cursorHour: number;
  width: number;
}) {
  const time =
    view === "week"
      ? minutesLabel(info.minutes, cursorHour)
      : info.count > 1
        ? `${formatHM(info.first)} ×${info.count}`
        : formatHM(info.first);

  const timeCol = pad(time, 20);
  const schedCol = pad(info.job.schedule, 16);
  const cmdWidth = Math.max(8, width - 4 - timeCol.length - schedCol.length - 4);

  return (
    <text>
      <span fg={info.job.color}>{"● "}</span>
      <span fg={UI.text}>{timeCol}</span>
      <span fg={UI.dim}>{`${schedCol}  `}</span>
      <span fg={UI.text}>{truncate(info.job.command, cmdWidth)}</span>
    </text>
  );
}

function minutesLabel(minutes: number[], hour: number): string {
  const hh = String(hour).padStart(2, "0");
  if (minutes.length === 1) return `${hh}:${String(minutes[0]).padStart(2, "0")}`;
  const shownCount = 3;
  const parts = minutes.slice(0, shownCount).map((m) => `:${String(m).padStart(2, "0")}`);
  const extra = minutes.length - shownCount;
  return `${hh}h ${parts.join(" ")}${extra > 0 ? ` +${extra}` : ""}`;
}
