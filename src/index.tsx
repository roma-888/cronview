#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { CliError, HELP, VERSION, parseArgs, type CliOptions } from "./cli";
import { loadCrontabFile, loadUserCrontab, parseCrontab } from "./crontab";
import { fetchHistory } from "./history";
import { App } from "./ui/App";

function fail(message: string): never {
  console.error(`cronview: ${message}`);
  process.exit(1);
}

let opts: CliOptions;
try {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.kind === "help") {
    console.log(HELP);
    process.exit(0);
  }
  if (parsed.kind === "version") {
    console.log(VERSION);
    process.exit(0);
  }
  opts = parsed.options;
} catch (err) {
  if (err instanceof CliError) fail(err.message);
  throw err;
}

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
  // --editor may carry arguments ("code -w"); the file path goes last.
  const editor = opts.editor ?? process.env.VISUAL ?? process.env.EDITOR ?? "vi";
  const [cmd, ...args] = editor.split(/\s+/) as [string, ...string[]];
  runEditor = () => {
    spawnSync(cmd, [...args, file], { stdio: "inherit" });
  };
} else {
  text = loadUserCrontab();
  source = "crontab -l";
  readSource = () => loadUserCrontab();
  // crontab -e picks its own editor from VISUAL/EDITOR, so --editor overrides via env.
  const env = opts.editor ? { ...process.env, VISUAL: opts.editor } : process.env;
  runEditor = () => {
    spawnSync("crontab", ["-e"], { stdio: "inherit", env });
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
    loadHistory={() => fetchHistory(7)}
  />,
);
