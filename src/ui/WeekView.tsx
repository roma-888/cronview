import { useMemo } from "react";
import type { CronJob } from "../types";
import { dayInfosForRange, runsInHour, type JobDayInfo } from "../schedule";
import { DAY_NAMES, addDays, dateKey, isSameDay, startOfWeek } from "../dates";
import { UI, clamp, pad } from "./theme";

interface WeekViewProps {
  jobs: CronJob[];
  cursor: Date;
  cursorHour: number;
  width: number;
  /** How many hour rows fit on screen. */
  maxHourRows: number;
}

export function WeekView({ jobs, cursor, cursorHour, width, maxHourRows }: WeekViewProps) {
  const weekStart = startOfWeek(cursor);
  const weekKey = dateKey(weekStart);

  const infosByDay = useMemo(
    () => dayInfosForRange(jobs, weekStart, 7),
    [jobs, weekKey],
  );

  const labelW = 4;
  // Columns split the full terminal width; only a floor so narrow terminals stay legible.
  const cellW = Math.max(6, Math.floor((width - labelW - 2) / 7));
  const today = new Date();

  const hours = visibleHours(maxHourRows, cursorHour);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <box style={{ flexDirection: "column" }}>
      <text>
        <span>{" ".repeat(labelW)}</span>
        {days.map((day, i) => {
          const selected = isSameDay(day, cursor);
          const label = pad(` ${DAY_NAMES[day.getDay()]} ${day.getDate()}`, cellW);
          return (
            <span
              key={i}
              fg={selected ? UI.accent : isSameDay(day, today) ? UI.today : UI.dim}
            >
              {label}
            </span>
          );
        })}
      </text>
      {hours.top ? <text fg={UI.faint}>{pad("  ⋮", labelW)}</text> : null}
      {hours.list.map((h) => (
        <HourRow
          key={h}
          hour={h}
          days={days}
          infosByDay={infosByDay}
          cursor={cursor}
          cursorHour={cursorHour}
          labelW={labelW}
          cellW={cellW}
        />
      ))}
      {hours.bottom ? <text fg={UI.faint}>{pad("  ⋮", labelW)}</text> : null}
    </box>
  );
}

function visibleHours(
  maxRows: number,
  cursorHour: number,
): { list: number[]; top: boolean; bottom: boolean } {
  const total = clamp(maxRows, 4, 24);
  if (total >= 24) {
    return { list: Array.from({ length: 24 }, (_, i) => i), top: false, bottom: false };
  }
  const start = clamp(cursorHour - Math.floor(total / 2), 0, 24 - total);
  return {
    list: Array.from({ length: total }, (_, i) => start + i),
    top: start > 0,
    bottom: start + total < 24,
  };
}

interface HourRowProps {
  hour: number;
  days: Date[];
  infosByDay: Map<string, JobDayInfo[]>;
  cursor: Date;
  cursorHour: number;
  labelW: number;
  cellW: number;
}

function HourRow({ hour, days, infosByDay, cursor, cursorHour, labelW, cellW }: HourRowProps) {
  const isCursorRow = hour === cursorHour;
  return (
    <box style={{ flexDirection: "row" }}>
      <text fg={isCursorRow ? UI.accent : UI.dim}>
        {pad(` ${String(hour).padStart(2, "0")}`, labelW)}
      </text>
      {days.map((day, i) => {
        const infos = infosByDay.get(dateKey(day)) ?? [];
        const active = infos.filter((info) => runsInHour(info, hour) > 0);
        const runs = active.reduce((sum, info) => sum + runsInHour(info, hour), 0);
        const selected = isCursorRow && isSameDay(day, cursor);
        const fg =
          active.length === 1 ? active[0]!.job.color : active.length > 1 ? UI.text : UI.faint;
        const content = runs > 0 ? pad(` ●${runs > 1 ? runs : ""}`, cellW) : pad(" ·", cellW);
        return (
          <box
            key={i}
            style={{
              width: cellW,
              height: 1,
              backgroundColor: selected ? UI.selectionBg : "transparent",
            }}
          >
            <text fg={fg}>{content}</text>
          </box>
        );
      })}
    </box>
  );
}
