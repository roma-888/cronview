#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { loadCrontabFile, loadUserCrontab, parseCrontab } from "./crontab";
import { parseDateArg } from "./dates";
import type { HourFormat, ViewMode } from "./types";
import { App } from "./ui/App";

const VERSION = "0.3.0";

const HELP = `cronview ${VERSION} — terminal calendar viewer for your cron jobs

Usage:
  cronview [options]

Options:
  -f, --file <path>     Read a crontab file instead of \`crontab -l\`
  -v, --view <mode>     Initial view: month (default) or week
  -d, --date <date>     Initial date, YYYY-MM-DD (default: today)
      --hours <12|24>   Clock format (default: 24)
  -h, --help            Show this help
      --version         Show version

Keys:
  ←/→      previous / next day
  ↑/↓      previous / next week (month view) · hour (week view)
  [ / ]    previous / next month (month view) · week (week view)
  m / w    month / week view        t   jump to today
  a        12/24-hour clock         q / Esc  quit
  e        edit the crontab in your editor, reload on exit
  1-9      peek at a job's output log (numbers in the detail pane)

The calendar also live-reloads within a few seconds when the crontab changes.
`;

interface CliOptions {
  file?: string;
  view: ViewMode;
  date: Date;
  hours: HourFormat;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { view: "month", date: new Date(), hours: "24" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "-h":
      case "--help":
        console.log(HELP);
        process.exit(0);
      case "--version":
        console.log(VERSION);
        process.exit(0);
      case "-f":
      case "--file": {
        const value = argv[++i];
        if (!value) fail(`${arg} requires a path`);
        opts.file = value;
        break;
      }
      case "-v":
      case "--view": {
        const value = argv[++i];
        if (value !== "month" && value !== "week") fail(`--view must be "month" or "week"`);
        opts.view = value;
        break;
      }
      case "--hours": {
        const value = argv[++i];
        if (value !== "12" && value !== "24") fail(`--hours must be "12" or "24"`);
        opts.hours = value;
        break;
      }
      case "-d":
      case "--date": {
        const value = argv[++i];
        const date = value ? parseDateArg(value) : null;
        if (!date) fail(`--date must be a valid YYYY-MM-DD date`);
        opts.date = date;
        break;
      }
      default:
        fail(`unknown option: ${arg} (try --help)`);
    }
  }
  return opts;
}

function fail(message: string): never {
  console.error(`cronview: ${message}`);
  process.exit(1);
}

const opts = parseArgs(process.argv.slice(2));

let text: string;
let source: string;
let readSource: () => string;
let runEditor: () => void;
if (opts.file) {
  const file = opts.file;
  try {
    text = loadCrontabFile(file);
  } catch (err) {
    fail(`cannot read ${file}: ${err instanceof Error ? err.message : err}`);
  }
  source = file;
  readSource = () => loadCrontabFile(file);
  runEditor = () => {
    spawnSync(process.env.VISUAL || process.env.EDITOR || "vi", [file], { stdio: "inherit" });
  };
} else {
  text = loadUserCrontab();
  source = "crontab -l";
  readSource = () => loadUserCrontab();
  runEditor = () => {
    spawnSync("crontab", ["-e"], { stdio: "inherit" });
  };
}

const result = parseCrontab(text);

// useMouse: false keeps the terminal's native mouse behavior (right-click menus,
// text selection) — cronview is keyboard-only.
const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: false });
createRoot(renderer).render(
  <App
    result={result}
    initialView={opts.view}
    initialDate={opts.date}
    source={source}
    initialHourFormat={opts.hours}
    initialText={text}
    readSource={readSource}
    runEditor={runEditor}
  />,
);
