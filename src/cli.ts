import { parseDateArg } from "./dates";
import type { HourFormat, ViewMode } from "./types";

export const VERSION = "0.3.0";

export const HELP = `cronview ${VERSION} — terminal calendar viewer for your cron jobs

Usage:
  cronview [options]

Options:
  -f, --file <path>     Read a crontab file instead of \`crontab -l\`
  -v, --view <mode>     Initial view: month (default) or week
  -d, --date <date>     Initial date, YYYY-MM-DD (default: today)
      --hours <12|24>   Clock format (default: 24)
      --editor <cmd>    Editor for the e key (default: $VISUAL/$EDITOR, else vi)
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

export class CliError extends Error {}

export interface CliOptions {
  file?: string;
  view: ViewMode;
  date: Date;
  hours: HourFormat;
  editor?: string;
}

export type ParsedArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "options"; options: CliOptions };

export function parseArgs(argv: string[]): ParsedArgs {
  const opts: CliOptions = { view: "month", date: new Date(), hours: "24" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "-h":
      case "--help":
        return { kind: "help" };
      case "--version":
        return { kind: "version" };
      case "-f":
      case "--file": {
        const value = argv[++i];
        if (!value) throw new CliError(`${arg} requires a path`);
        opts.file = value;
        break;
      }
      case "-v":
      case "--view": {
        const value = argv[++i];
        if (value !== "month" && value !== "week") {
          throw new CliError(`--view must be "month" or "week"`);
        }
        opts.view = value;
        break;
      }
      case "--hours": {
        const value = argv[++i];
        if (value !== "12" && value !== "24") throw new CliError(`--hours must be "12" or "24"`);
        opts.hours = value;
        break;
      }
      case "--editor": {
        const value = argv[++i];
        if (!value) throw new CliError(`--editor requires a command`);
        opts.editor = value;
        break;
      }
      case "-d":
      case "--date": {
        const value = argv[++i];
        const date = value ? parseDateArg(value) : null;
        if (!date) throw new CliError(`--date must be a valid YYYY-MM-DD date`);
        opts.date = date;
        break;
      }
      default:
        throw new CliError(`unknown option: ${arg} (try --help)`);
    }
  }
  return { kind: "options", options: opts };
}
