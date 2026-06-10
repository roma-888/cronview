import { useMemo } from "react";
import type { CronJob } from "../types";
import { dayInfosForRange, totalRuns, type JobDayInfo } from "../schedule";
import { DAY_NAMES, addDays, dateKey, isSameDay, startOfWeek, weeksInMonthGrid } from "../dates";
import { UI, formatCount, pad } from "./theme";

interface MonthViewProps {
  jobs: CronJob[];
  cursor: Date;
  width: number;
  /** Rows per day cell: 2 (compact) up to 5 (tall terminals). */
  cellH: number;
}

export function MonthView({ jobs, cursor, width, cellH }: MonthViewProps) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = startOfWeek(firstOfMonth);
  const weeks = weeksInMonthGrid(year, month);

  const infosByDay = useMemo(
    () => dayInfosForRange(jobs, gridStart, weeks * 7),
    [jobs, year, month, weeks],
  );

  // Columns split the full terminal width; only a floor so narrow terminals stay legible.
  const cellW = Math.max(9, Math.floor((width - 2) / 7));
  const today = new Date();

  const rows = [];
  for (let w = 0; w < weeks; w++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(gridStart, w * 7 + d);
      cells.push(
        <DayCell
          key={d}
          day={day}
          infos={infosByDay.get(dateKey(day)) ?? []}
          inMonth={day.getMonth() === month}
          selected={isSameDay(day, cursor)}
          isToday={isSameDay(day, today)}
          cellW={cellW}
          cellH={cellH}
        />,
      );
    }
    rows.push(
      <box key={w} style={{ flexDirection: "row" }}>
        {cells}
      </box>,
    );
  }

  return (
    <box style={{ flexDirection: "column" }}>
      <text fg={UI.dim}>{DAY_NAMES.map((n) => pad(` ${n}`, cellW)).join("")}</text>
      {rows}
    </box>
  );
}

interface DayCellProps {
  day: Date;
  infos: JobDayInfo[];
  inMonth: boolean;
  selected: boolean;
  isToday: boolean;
  cellW: number;
  cellH: number;
}

function DayCell({ day, infos, inMonth, selected, isToday, cellW, cellH }: DayCellProps) {
  const count = totalRuns(infos);
  const dayStr = String(day.getDate()).padStart(2);
  const countStr = count > 0 ? `×${formatCount(count)}` : "";
  const rest = pad(` ${countStr}`, cellW - 3);

  const dayFg = isToday ? UI.today : inMonth ? UI.text : UI.faint;
  const countFg = inMonth ? UI.dim : UI.faint;

  const maxDots = cellW - 2;
  const dots = infos.slice(0, maxDots);
  const overflow = infos.length > maxDots;

  return (
    <box
      style={{
        width: cellW,
        height: cellH,
        flexDirection: "column",
        backgroundColor: selected ? UI.selectionBg : "transparent",
      }}
    >
      <text>
        <span fg={dayFg}>{isToday ? `${dayStr}*` : ` ${dayStr}`}</span>
        <span fg={countFg}>{rest}</span>
      </text>
      <text>
        <span> </span>
        {dots.map((info, i) => (
          <span key={i} fg={inMonth ? info.job.color : UI.faint}>
            ●
          </span>
        ))}
        {overflow ? <span fg={UI.dim}>+</span> : null}
      </text>
    </box>
  );
}
