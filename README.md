# cronview

A terminal calendar for your cron jobs. See **when** everything runs — in a month or week view — instead of squinting at five-field expressions.

![cronview demo: month and week views, the job view with a plain-English schedule and run history, filtering, and the help card](assets/demo.gif)

Built with [OpenTUI](https://github.com/anomalyco/opentui) and [cron-parser](https://github.com/harrisiirak/cron-parser).

## Install

Single self-contained binary — no runtime needed. With [Homebrew](https://brew.sh):

```sh
brew install roma-888/tap/cronview
```

Or with the install script:

```sh
curl -fsSL https://raw.githubusercontent.com/roma-888/cronview/main/scripts/install.sh | bash
```

Or grab `cronview-<os>-<arch>` from the [latest release](https://github.com/roma-888/cronview/releases/latest) yourself, `chmod +x` it, and put it on your PATH. Binaries are built for macOS (arm64, x64) and Linux (x64, arm64).

To run from source instead you need [Bun](https://bun.sh) (OpenTUI is currently Bun-exclusive): `bun install && bun src/index.tsx`. Build your own binary with `npm run build`.

## Usage

```sh
cronview                     # your crontab (`crontab -l`), month view, today
cronview --file path         # any crontab file
cronview --system            # also /etc/crontab + /etc/cron.d/* (Linux)
cronview --view week         # start in the week view
cronview --date 2026-07-01   # start on a specific date
cronview --hours 12          # 12-hour clock (default: 24)
cronview --editor nano       # editor for the e key (default: $VISUAL/$EDITOR, else vi)

npm run demo                 # from a checkout: tour with examples/sample.crontab
```

## Keys

| Key | Action |
| --- | --- |
| `←` `→` | previous / next day |
| `↑` `↓` | ±1 week (month view) · ±1 hour (week view) |
| `[` `]` | previous / next month (month view) · week (week view) |
| `m` / `w` | month view / week view |
| `t` | jump to today |
| `a` | toggle 12/24-hour clock |
| `e` | edit the crontab in `$EDITOR` (`crontab -e` for your user crontab), reload on exit |
| `/` | filter jobs by command substring (`Enter` apply, `Esc` clear) |
| `1`–`9` | open a job's view: schedule in plain English, next/recent runs, output log |
| `?` | help — the full keymap |
| `q` / `Esc` | quit (closes overlays and clears the filter first) |

These are the only bindings — every other key (and any modifier combo) is deliberately inert.

## Views

- **Month** — calendar grid; each day shows its total run count and one colored dot per job that runs that day. The detail pane lists the selected day's jobs sorted by first run time.
- **Week** — 7-day × 24-hour grid; each cell shows the number of runs in that hour, colored by job. On short terminals the hour axis scrolls (`⋮`) to follow the cursor. The detail pane shows the selected day + hour with the exact minute pattern (`:00 :15 :30 …`).

The layout fills the terminal at any size: columns split the full width, month cells grow taller as the terminal does, and the detail pane absorbs the remaining rows so it always sits directly under the grid. The minimum usable size is **66×22** — below that, cronview shows a resize notice instead of a broken layout.

The calendar live-reloads: cronview polls the crontab every few seconds and refreshes when it changes — whether you press `e` to edit it in place or change it from another terminal.

### Job view

Detail-pane rows are numbered; press a job's number to open everything about it:

- **The schedule in plain English** — `*/10 9-17 * * 1-5` becomes "every 10 minutes, 09:00–17:59, Mon–Fri" — plus the next 5 concrete run times.
- **Run history** — the last 5 scheduled runs judged against the system log (last 7 days): `✓` ran, `✗` no record, `?` ambiguous, `·` before log coverage. On Linux the journal attributes runs to exact commands; macOS only records that *a* cron job started each minute, so runs are confirmed per-minute and marked `?` when several jobs share a minute.
- **The tail of its log.** cronview finds the log by reading the job's own redirect (`>> /var/log/thing.log`), expanding `~` and `$VAR`s from the crontab's env lines. Jobs that redirect to `/dev/null` or don't redirect at all get a note explaining where the output went (discarded, or mailed by cron).

`↑`/`↓` scrolls the log, `r` re-reads it in place, `q`/`Esc` closes.

## What it understands

- Standard 5-field expressions, including ranges, steps, lists, and `L`
- `@hourly` `@daily` `@midnight` `@weekly` `@monthly` `@yearly` `@annually`
- `@reboot` jobs (shown in the status bar — they have no calendar position)
- `NAME=value` environment lines and comments
- `CRON_TZ=Zone` — jobs after it are scheduled in that timezone and shown at your local time (plain `TZ=` is deliberately ignored: it affects the command's environment, not the schedule)
- System crontabs (`--system`): `/etc/crontab` and `/etc/cron.d/*` with their six-field format — the run-as user shows dimmed next to each job, and the job view names the source file. Unreadable or absent files are skipped quietly (macOS has none; Apple uses launchd)
- Vixie-cron OR semantics when both day-of-month and day-of-week are restricted

Unparsable lines never crash the app; they're counted in the status bar (`⚠ n lines skipped`).

Run counts are computed with field math (`|minutes| × |hours|` on matching days), so a `* * * * *` job is `×1440` without iterating 1440 times.

## Development

```sh
bun install
bun test              # parser, schedule math, dates, logs, history, explainer, CLI, full-UI render suites
npx tsc --noEmit      # typecheck
bun scripts/frame.tsx week 120x40 12   # print a rendered frame without a TTY (12/24-hour optional)
```

UI tests render the real app headlessly via `@opentui/react/test-utils` and assert on captured frames, including simulated keypresses.

> **Note for iCloud-synced folders:** if this repo lives under an iCloud-synced path (Desktop/Documents), iCloud will corrupt `node_modules`. This repo's `node_modules` carries the `com.apple.fileprovider.ignore#P` xattr to prevent that; if you reinstall from scratch, re-apply it:
> `xattr -w 'com.apple.fileprovider.ignore#P' 1 node_modules`
