import { useMemo, useState } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import type { ParseResult, ViewMode } from "../types";
import {
  MONTH_NAMES,
  addDays,
  addMonths,
  dateKey,
  formatHM,
  isSameDay,
  startOfDay,
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
}

/**
 * Smallest terminal cronview renders into. Width fits the month grid at its
 * minimum cell width (7×9 + margins); height fits a 6-week month with compact
 * 2-row cells and the reduced 5-row detail pane.
 */
export const MIN_WIDTH = 66;
export const MIN_HEIGHT = 22;

export function App({ result, initialView, initialDate, source }: AppProps) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const [view, setView] = useState<ViewMode>(initialView);
  const [cursor, setCursor] = useState<Date>(startOfDay(initialDate));
  const [cursorHour, setCursorHour] = useState<number>(new Date().getHours());

  // The keymap is exactly what the status bar advertises: ←→ ↑↓ [ ] m w t q (+Esc).
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
    ? `next: ${isSameDay(next.at, new Date()) ? "today" : `${MONTH_NAMES[next.at.getMonth()]!.slice(0, 3)} ${next.at.getDate()}`} ${formatHM(next.at)} ${truncate(next.job.command, 28)}`
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

  // The detail pane shrinks before the calendar does.
  const detailHeight = height >= 34 ? 9 : height >= 28 ? 7 : 5;

  // Rows left for the week view's hour grid: total minus header (1), top padding (1),
  // day-name row (1), two possible ⋮ scroll markers, detail pane, status bar (1).
  const maxHourRows = clamp(height - detailHeight - 6, 4, 24);

  // Month cells drop their spacing row when a 6-week grid wouldn't fit.
  const monthCellH = height - detailHeight - 4 >= 18 ? 3 : 2;

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
        crontabEmpty={result.jobs.length === 0 && result.reboots.length === 0}
      />
      <StatusBar view={view} result={result} />
    </box>
  );
}
