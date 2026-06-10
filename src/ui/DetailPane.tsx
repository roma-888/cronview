import type { JobDayInfo } from "../schedule";
import { runsInHour, totalRuns } from "../schedule";
import { formatDayLong, formatHM, formatHourRange, hour12 } from "../dates";
import type { HourFormat, ViewMode } from "../types";
import { UI, pad, truncate } from "./theme";

interface DetailPaneProps {
  /** Already filtered to what the pane shows (App owns the week-view hour filter). */
  infos: JobDayInfo[];
  cursor: Date;
  cursorHour: number;
  view: ViewMode;
  width: number;
  /** Total rows available including the title row. */
  height: number;
  hourFormat: HourFormat;
  crontabEmpty: boolean;
}

export function DetailPane({
  infos,
  cursor,
  cursorHour,
  view,
  width,
  height,
  hourFormat,
  crontabEmpty,
}: DetailPaneProps) {
  const shown = infos;

  const hourLabel = formatHourRange(cursorHour, hourFormat);
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
        visible.map((info, i) => (
          <JobLine
            key={info.job.id}
            info={info}
            index={i}
            view={view}
            cursorHour={cursorHour}
            width={width}
            hourFormat={hourFormat}
          />
        ))
      )}
      {hidden > 0 ? <text fg={UI.dim}>{`  … +${hidden} more`}</text> : null}
    </box>
  );
}

function JobLine({
  info,
  index,
  view,
  cursorHour,
  width,
  hourFormat,
}: {
  info: JobDayInfo;
  index: number;
  view: ViewMode;
  cursorHour: number;
  width: number;
  hourFormat: HourFormat;
}) {
  const time =
    view === "week"
      ? minutesLabel(info.minutes, cursorHour, hourFormat)
      : info.count > 1
        ? `${formatHM(info.first, hourFormat)} ×${info.count}`
        : formatHM(info.first, hourFormat);

  const timeCol = pad(time, 20);
  const schedCol = pad(info.job.schedule, 16);
  const cmdWidth = Math.max(8, width - 6 - timeCol.length - schedCol.length - 4);

  return (
    <text>
      <span fg={UI.dim}>{index < 9 ? `${index + 1} ` : "  "}</span>
      <span fg={info.job.color}>{"● "}</span>
      <span fg={UI.text}>{timeCol}</span>
      <span fg={UI.dim}>{`${schedCol}  `}</span>
      <span fg={UI.text}>{truncate(info.job.command, cmdWidth)}</span>
    </text>
  );
}

function minutesLabel(minutes: number[], hour: number, fmt: HourFormat): string {
  const { h, suffix } = hour12(hour);
  if (minutes.length === 1) {
    const mm = String(minutes[0]).padStart(2, "0");
    return fmt === "12" ? `${h}:${mm}${suffix}` : `${String(hour).padStart(2, "0")}:${mm}`;
  }
  // Multi-run prefix: "13h" in 24-hour mode, "1pm" in 12-hour mode.
  const prefix = fmt === "12" ? `${h}${suffix}` : `${String(hour).padStart(2, "0")}h`;
  const shownCount = 3;
  const parts = minutes.slice(0, shownCount).map((m) => `:${String(m).padStart(2, "0")}`);
  const extra = minutes.length - shownCount;
  return `${prefix} ${parts.join(" ")}${extra > 0 ? ` +${extra}` : ""}`;
}
