# cronview

A terminal calendar for your cron jobs. See **when** everything runs — in a month or week view — instead of squinting at five-field expressions.

```
 cronview June 2026 · month                            next: today 13:00 health-check…
  Sun          Mon          Tue          Wed          Thu          Fri          Sat
  31 ×104       1 ×104       2 ×103       3 ×103       4 ×103       5 ×103       6 ×102
  ●●●●●●       ●●●●●●       ●●●●●        ●●●●●        ●●●●●        ●●●●●        ●●●●
   7 ×104       8 ×103       9 ×103     10* ×103      11 ×103      12 ×103      13 ×102
  ●●●●●●       ●●●●●        ●●●●●        ●●●●●        ●●●●●        ●●●●●        ●●●●
 ─────────────────────────────────────────────────────────────────────────────────────
 Wednesday, June 10, 2026 — 5 jobs, 103 runs
 ● 00:00 ×96         */15 * * * *      /usr/local/bin/health-check --ping
 ● 02:30             30 2 * * *        /usr/local/bin/backup --incremental
 ● 09:00             0 9 * * 1-5       $HOME/scripts/standup-reminder.sh
```

Built with [OpenTUI](https://github.com/anomalyco/opentui) and [cron-parser](https://github.com/harrisiirak/cron-parser).

## Install

Single self-contained binary — no runtime needed:

```sh
curl -fsSL https://raw.githubusercontent.com/roma-888/cronview/main/scripts/install.sh | bash
```

Or grab `cronview-<os>-<arch>` from the [latest release](https://github.com/roma-888/cronview/releases/latest) yourself, `chmod +x` it, and put it on your PATH. Binaries are built for macOS (arm64, x64) and Linux (x64, arm64).

To run from source instead you need [Bun](https://bun.sh) (OpenTUI is currently Bun-exclusive): `bun install && bun src/index.tsx`. Build your own binary with `npm run build`.

## Usage

```sh
cronview                     # your crontab (`crontab -l`), month view, today
cronview --file path         # any crontab file
cronview --view week         # start in the week view
cronview --date 2026-07-01   # start on a specific date
cronview --hours 12          # 12-hour clock (default: 24)

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
| `1`–`9` | peek at a job's output log (numbers in the detail pane) |
| `q` / `Esc` | quit (closes the log peek first) |

These are the only bindings — every other key (and any modifier combo) is deliberately inert.

## Views

- **Month** — calendar grid; each day shows its total run count and one colored dot per job that runs that day. The detail pane lists the selected day's jobs sorted by first run time.
- **Week** — 7-day × 24-hour grid; each cell shows the number of runs in that hour, colored by job. On short terminals the hour axis scrolls (`⋮`) to follow the cursor. The detail pane shows the selected day + hour with the exact minute pattern (`:00 :15 :30 …`).

The layout fills the terminal at any size: columns split the full width, month cells grow taller as the terminal does, and the detail pane absorbs the remaining rows so it always sits directly under the grid. The minimum usable size is **66×22** — below that, cronview shows a resize notice instead of a broken layout.

### Log peek

Detail-pane rows are numbered; press a job's number to open the tail of its log. cronview finds the log by reading the job's own redirect (`>> /var/log/thing.log`), expanding `~` and `$VAR`s from the crontab's env lines. Jobs that redirect to `/dev/null` or don't redirect at all get a note explaining where the output went (discarded, or mailed by cron). `↑`/`↓` scrolls, `q`/`Esc` closes.

## What it understands

- Standard 5-field expressions, including ranges, steps, lists, and `L`
- `@hourly` `@daily` `@midnight` `@weekly` `@monthly` `@yearly` `@annually`
- `@reboot` jobs (shown in the status bar — they have no calendar position)
- `NAME=value` environment lines and comments
- Vixie-cron OR semantics when both day-of-month and day-of-week are restricted

Unparsable lines never crash the app; they're counted in the status bar (`⚠ n lines skipped`).

Run counts are computed with field math (`|minutes| × |hours|` on matching days), so a `* * * * *` job is `×1440` without iterating 1440 times.

## Development

```sh
bun install
bun test              # 52 tests: parser, schedule math, dates, full-UI render tests
npx tsc --noEmit      # typecheck
bun scripts/frame.tsx week 120x40   # print a rendered frame without a TTY
```

UI tests render the real app headlessly via `@opentui/react/test-utils` and assert on captured frames, including simulated keypresses.

> **Note for iCloud-synced folders:** if this repo lives under an iCloud-synced path (Desktop/Documents), iCloud will corrupt `node_modules`. This repo's `node_modules` carries the `com.apple.fileprovider.ignore#P` xattr to prevent that; if you reinstall from scratch, re-apply it:
> `xattr -w 'com.apple.fileprovider.ignore#P' 1 node_modules`
