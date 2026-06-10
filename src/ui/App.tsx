import { useMemo, useState } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import type { HourFormat, ParseResult, ViewMode } from "../types";
import {
  MONTH_NAMES,
  addDays,
  addMonths,
  dateKey,
  formatHM,
  isSameDay,
  startOfDay,
  weeksInMonthGrid,
} from "../dates";
import { dayInfosForRange, nextRunAcross } from "../schedule";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DetailPane } from "./DetailPane";
import { StatusBar } from "./StatusBar";
import { UI, clamp, truncate } from "./theme";

interface AppProps {
  result: ParseResult;
  initialView: ViewMode;
  initialDate: Date;
  source: string;
  initialHourFormat?: HourFormat;
}

/**
 * Smallest terminal cronview renders into. Width fits the month grid at its
 * minimum cell width (7×9 + margins); height fits a 6-week month with compact
 * 2-row cells and the reduced 5-row detail pane.
 */
export const MIN_WIDTH = 66;
export const MIN_HEIGHT = 22;

export function App({
  result,
  initialView,
  initialDate,
  source,
  initialHourFormat = "24",
}: AppProps) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const [view, setView] = useState<ViewMode>(initialView);
  const [cursor, setCursor] = useState<Date>(startOfDay(initialDate));
  const [cursorHour, setCursorHour] = useState<number>(new Date().getHours());
  const [hourFormat, setHourFormat] = useState<HourFormat>(initialHourFormat);

  // The keymap is exactly what the status bar advertises: ←→ ↑↓ [ ] m w t a q (+Esc).
  // Anything else — including modifier combos — is deliberately inert.
  useKeyboard((key) => {
    if (key.ctrl || key.meta || key.option) return;
    switch (key.name) {
      case "q":
      case "escape":
        renderer.destroy();
        process.exit(0);
        break;
      case "m":
        setView("month");
        break;
      case "w":
        setView("week");
        break;
      case "a":
        setHourFormat((f) => (f === "24" ? "12" : "24"));
        break;
      case "t": {
        const now = new Date();
        setCursor(startOfDay(now));
        setCursorHour(now.getHours());
        break;
      }
      case "left":
        setCursor((c) => addDays(c, -1));
        break;
      case "right":
        setCursor((c) => addDays(c, 1));
        break;
      case "up":
        if (view === "month") setCursor((c) => addDays(c, -7));
        else setCursorHour((h) => clamp(h - 1, 0, 23));
        break;
      case "down":
        if (view === "month") setCursor((c) => addDays(c, 7));
        else setCursorHour((h) => clamp(h + 1, 0, 23));
        break;
      case "[":
        setCursor((c) => (view === "month" ? addMonths(c, -1) : addDays(c, -7)));
        break;
      case "]":
        setCursor((c) => (view === "month" ? addMonths(c, 1) : addDays(c, 7)));
        break;
    }
  });

  const cursorInfos = useMemo(
    () => dayInfosForRange(result.jobs, cursor, 1).get(dateKey(cursor)) ?? [],
    [result.jobs, dateKey(cursor)],
  );

  const next = useMemo(() => nextRunAcross(result.jobs, new Date()), [result.jobs]);

  const monthLabel = `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const nextLabel = next
    ? `next: ${isSameDay(next.at, new Date()) ? "today" : `${MONTH_NAMES[next.at.getMonth()]!.slice(0, 3)} ${next.at.getDate()}`} ${formatHM(next.at, hourFormat)} ${truncate(next.job.command, 28)}`
    : "";

  // Either undersized dimension alone is enough to break the layout, so each
  // is checked and reported on its own.
  const tooNarrow = width < MIN_WIDTH;
  const tooShort = height < MIN_HEIGHT;
  if (tooNarrow || tooShort) {
    return (
      <box
        style={{
          flexDirection: "column",
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <text fg={UI.warn}>Terminal too small</text>
        {tooNarrow ? (
          <text fg={UI.dim}>{`width ${width} < ${MIN_WIDTH} minimum`}</text>
        ) : null}
        {tooShort ? (
          <text fg={UI.dim}>{`height ${height} < ${MIN_HEIGHT} minimum`}</text>
        ) : null}
        <text fg={UI.dim}>resize the window, or press q to quit</text>
      </box>
    );
  }

  // The grid claims the terminal height first (keeping at least a 5-row detail
  // pane), and the detail pane absorbs every leftover row so no dead space
  // opens up between the grid and its separator.
  // Rows available to the grid: total minus header (1), top padding (1),
  // status bar (1), and the minimum detail pane.
  const gridAvail = height - 3 - 5;

  // Month cells grow from 2 rows (compact) to 5 (tall terminals).
  const weeks = weeksInMonthGrid(cursor.getFullYear(), cursor.getMonth());
  const monthCellH = clamp(Math.floor((gridAvail - 1) / weeks), 2, 5);

  // The week grid spends its budget on the day-name row and two possible ⋮
  // scroll markers before hour rows.
  const maxHourRows = clamp(gridAvail - 3, 4, 24);

  const gridRows =
    view === "month"
      ? 1 + weeks * monthCellH
      : 1 + maxHourRows + (maxHourRows < 24 ? 2 : 0);
  const detailHeight = height - 3 - gridRows;

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          height: 1,
          backgroundColor: UI.headerBg,
        }}
      >
        <text>
          <span fg={UI.accent}>{" cronview "}</span>
          <span fg={UI.text}>{monthLabel}</span>
          <span fg={UI.dim}>{` · ${view} · ${source}`}</span>
        </text>
        <text fg={UI.dim}>{`${nextLabel} `}</text>
      </box>
      <box style={{ flexDirection: "column", flexGrow: 1, paddingTop: 1, paddingLeft: 1 }}>
        {view === "month" ? (
          <MonthView jobs={result.jobs} cursor={cursor} width={width - 2} cellH={monthCellH} />
        ) : (
          <WeekView
            jobs={result.jobs}
            cursor={cursor}
            cursorHour={cursorHour}
            width={width - 2}
            maxHourRows={maxHourRows}
            hourFormat={hourFormat}
          />
        )}
      </box>
      <DetailPane
        infos={cursorInfos}
        cursor={cursor}
        cursorHour={cursorHour}
        view={view}
        width={width}
        height={detailHeight}
        hourFormat={hourFormat}
        crontabEmpty={result.jobs.length === 0 && result.reboots.length === 0}
      />
      <StatusBar view={view} result={result} />
    </box>
  );
}
