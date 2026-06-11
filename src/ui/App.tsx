import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { parseCrontab } from "../crontab";
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
import { dayInfosForRange, nextRunAcross, nextRuns, prevRuns, runsAt, runsInHour } from "../schedule";
import { explainSchedule } from "../explain";
import { outputTarget, readLogTail, type LogTail, type OutputTarget } from "../logs";
import { buildIndex, runStatus, type RunHistory } from "../history";
import type { CronJob } from "../types";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DetailPane } from "./DetailPane";
import { StatusBar } from "./StatusBar";
import { LogView, logContentRows } from "./LogView";
import { HelpView } from "./HelpView";
import { UI, clamp, truncate } from "./theme";

interface AppProps {
  result: ParseResult;
  initialView: ViewMode;
  initialDate: Date;
  source: string;
  initialHourFormat?: HourFormat;
  /** The crontab text `result` was parsed from; reloads diff against it. */
  initialText?: string;
  /** Re-reads the crontab source; absent means live reload is off. */
  readSource?: () => string;
  pollMs?: number;
  /** Runs the user's editor, blocking until it exits (the renderer is suspended). */
  runEditor?: () => void;
  /** Fetches cron run evidence from the system log; absent hides run history. */
  loadHistory?: () => Promise<RunHistory>;
}

/**
 * Smallest terminal cronview renders into. Width fits the month grid at its
 * minimum cell width (7×9 + margins); height fits a 6-week month with compact
 * 2-row cells and the reduced 5-row detail pane.
 */
export const MIN_WIDTH = 66;
export const MIN_HEIGHT = 22;

export function App({
  result: initialResult,
  initialView,
  initialDate,
  source,
  initialHourFormat = "24",
  initialText = "",
  readSource,
  pollMs = 3000,
  runEditor,
  loadHistory,
}: AppProps) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const [result, setResult] = useState<ParseResult>(initialResult);
  const [view, setView] = useState<ViewMode>(initialView);
  const [cursor, setCursor] = useState<Date>(startOfDay(initialDate));
  const [cursorHour, setCursorHour] = useState<number>(new Date().getHours());
  const [hourFormat, setHourFormat] = useState<HourFormat>(initialHourFormat);
  const [log, setLog] = useState<{ job: CronJob; target: OutputTarget; tail: LogTail | null } | null>(
    null,
  );
  const [logScroll, setLogScroll] = useState(0);
  const [history, setHistory] = useState<RunHistory | null>(null);
  // Committed filter ("" = off) and the in-progress query buffer (null = not typing).
  const [filter, setFilter] = useState("");
  const [filterDraft, setFilterDraft] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const visibleJobs = useMemo(() => {
    if (!filter) return result.jobs;
    const q = filter.toLowerCase();
    return result.jobs.filter((j) => j.command.toLowerCase().includes(q));
  }, [result.jobs, filter]);

  useEffect(() => {
    let cancelled = false;
    loadHistory?.().then((h) => {
      if (!cancelled) setHistory(h);
    });
    return () => {
      cancelled = true;
    };
  }, [loadHistory]);

  // Judge the open job's recent scheduled runs against the system log.
  const ran = useMemo(() => {
    if (!log || !loadHistory) return undefined;
    if (!history) return "loading" as const;
    if (history.note) return { items: [], note: history.note };
    const index = buildIndex(history.records);
    const items = prevRuns(log.job, new Date(), 5).map((at) => ({
      at,
      status: runStatus(
        index,
        at,
        log.job.command,
        result.jobs.filter((j) => runsAt(j, at)).length,
        history.coverageStart,
        history.fetchedAt,
      ),
    }));
    return { items };
  }, [log, history, loadHistory, result.jobs]);

  const cursorInfos = useMemo(
    () => dayInfosForRange(visibleJobs, cursor, 1).get(dateKey(cursor)) ?? [],
    [visibleJobs, dateKey(cursor)],
  );

  // The detail pane and the 1-9 log keys must agree on job numbering, so the
  // week view's hour filter lives here rather than in the pane.
  const shownInfos = useMemo(
    () => (view === "week" ? cursorInfos.filter((i) => runsInHour(i, cursorHour) > 0) : cursorInfos),
    [cursorInfos, view, cursorHour],
  );

  const maxLogScroll = log?.tail ? Math.max(0, log.tail.lines.length - logContentRows(height)) : 0;

  // Live reload: re-parse only when the source text actually changed, and keep
  // the last good parse if a read fails (e.g. mid-save).
  const sourceText = useRef(initialText);
  const refresh = useCallback(() => {
    if (!readSource) return;
    let text: string;
    try {
      text = readSource();
    } catch {
      return;
    }
    if (text === sourceText.current) return;
    sourceText.current = text;
    setResult(parseCrontab(text));
  }, [readSource]);

  useEffect(() => {
    if (!readSource) return;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs, readSource]);

  // The keymap is exactly what the ? help card (KEYMAP in cli.ts) advertises:
  // ←→ ↑↓ [ ] m w t a e / 1-9 ? q (+Esc). Anything else — including modifier
  // combos — is deliberately inert.
  useKeyboard((key) => {
    if (key.ctrl || key.meta || key.option) return;
    // The log overlay captures all keys while open.
    if (log) {
      switch (key.name) {
        case "q":
        case "escape":
          setLog(null);
          break;
        case "r":
          if (log.target.kind === "file") {
            const tail = readLogTail(log.target.path);
            setLog({ ...log, tail });
            setLogScroll((s) =>
              Math.min(s, tail ? Math.max(0, tail.lines.length - logContentRows(height)) : 0),
            );
          }
          break;
        case "up":
          setLogScroll((s) => Math.min(s + 1, maxLogScroll));
          break;
        case "down":
          setLogScroll((s) => Math.max(s - 1, 0));
          break;
      }
      return;
    }
    // The help card captures all keys while open.
    if (helpOpen) {
      if (key.name === "?" || key.name === "q" || key.name === "escape") setHelpOpen(false);
      return;
    }
    // Filter typing captures every key until committed or cancelled.
    if (filterDraft !== null) {
      switch (key.name) {
        case "return":
        case "enter":
          setFilter(filterDraft);
          setFilterDraft(null);
          break;
        case "escape":
          setFilterDraft(null);
          break;
        case "backspace":
          setFilterDraft((d) => (d ?? "").slice(0, -1));
          break;
        case "space":
          setFilterDraft((d) => `${d ?? ""} `);
          break;
        default:
          if (key.name.length === 1) setFilterDraft((d) => `${d ?? ""}${key.name}`);
      }
      return;
    }
    if (key.name === "/") {
      setFilterDraft(filter);
      return;
    }
    if (key.name === "?") {
      setHelpOpen(true);
      return;
    }
    if (key.name === "escape" && filter) {
      setFilter("");
      return;
    }
    if (/^[1-9]$/.test(key.name)) {
      const info = shownInfos[Number(key.name) - 1];
      if (info) {
        const target = outputTarget(info.job.command, result.env);
        const tail = target.kind === "file" ? readLogTail(target.path) : null;
        setLog({ job: info.job, target, tail });
        setLogScroll(0);
      }
      return;
    }
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
      case "e":
        if (runEditor) {
          renderer.suspend?.();
          try {
            runEditor();
          } finally {
            renderer.resume?.();
          }
          refresh();
        }
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

  const next = useMemo(() => nextRunAcross(visibleJobs, new Date()), [visibleJobs]);

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

  if (helpOpen) {
    return <HelpView />;
  }

  if (log) {
    return (
      <LogView
        job={log.job}
        target={log.target}
        tail={log.tail}
        explanation={explainSchedule(log.job.expression, hourFormat, log.job.tz)}
        upcoming={nextRuns(log.job, new Date(), 5)}
        ran={ran}
        hourFormat={hourFormat}
        width={width}
        height={height}
        scroll={logScroll}
      />
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
          <MonthView jobs={visibleJobs} cursor={cursor} width={width - 2} cellH={monthCellH} />
        ) : (
          <WeekView
            jobs={visibleJobs}
            cursor={cursor}
            cursorHour={cursorHour}
            width={width - 2}
            maxHourRows={maxHourRows}
            hourFormat={hourFormat}
          />
        )}
      </box>
      <DetailPane
        infos={shownInfos}
        cursor={cursor}
        cursorHour={cursorHour}
        view={view}
        width={width}
        height={detailHeight}
        hourFormat={hourFormat}
        crontabEmpty={result.jobs.length === 0 && result.reboots.length === 0}
      />
      <StatusBar
        view={view}
        result={result}
        filter={filter}
        filterDraft={filterDraft}
        matches={visibleJobs.length}
      />
    </box>
  );
}
