import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { parseCrontab } from "../src/crontab";
import { App } from "../src/ui/App";

const sample = readFileSync(join(import.meta.dir, "../examples/sample.crontab"), "utf8");
const result = parseCrontab(sample);

// Fixed reference date: Wednesday, June 10, 2026.
const june10 = new Date(2026, 5, 10);

async function renderApp(view: "month" | "week" = "month", hours: "12" | "24" = "24") {
  const setup = await testRender(
    <App
      result={result}
      initialView={view}
      initialDate={june10}
      source="sample"
      initialHourFormat={hours}
    />,
    { width: 100, height: 38 },
  );
  await setup.renderOnce();
  return setup;
}

describe("App (month view)", () => {
  test("renders the month grid with day names and counts", async () => {
    const { captureCharFrame, renderer } = await renderApp();
    const frame = captureCharFrame();
    expect(frame).toContain("cronview");
    expect(frame).toContain("June 2026");
    expect(frame).toContain("Sun");
    expect(frame).toContain("Sat");
    // */15 (96) + 0 */6 (4) + @daily (1) + backup 2:30 (1) + standup (weekday, 1) = 103 on Wed Jun 10
    expect(frame).toContain("×103");
    renderer.destroy();
  });

  test("detail pane lists the selected day's jobs", async () => {
    const { captureCharFrame, renderer } = await renderApp();
    const frame = captureCharFrame();
    expect(frame).toContain("Wednesday, June 10, 2026");
    expect(frame).toContain("health-check --ping");
    expect(frame).toContain("standup-reminder.sh");
    // Sunday-only jobs should not be in Wednesday's detail
    expect(frame).not.toContain("backup --full");
    renderer.destroy();
  });

  test("arrow keys move the cursor day", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.mockInput.pressKey("ARROW_LEFT");
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("Tuesday, June 9, 2026");
    setup.renderer.destroy();
  });

  test("] jumps to next month", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.mockInput.pressKey("]");
    });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("July 2026");
    setup.renderer.destroy();
  });

  test("unassigned keys do nothing", async () => {
    const setup = await renderApp();
    const before = setup.captureCharFrame();
    // Former vim/page aliases and a sample of random keys must all be inert.
    for (const key of ["h", "j", "k", "l", "v", "x", "n", "0", " ", "RETURN", "TAB"]) {
      await act(async () => {
        setup.mockInput.pressKey(key);
      });
    }
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toBe(before);
    setup.renderer.destroy();
  });

  test("modifier combos of assigned keys are inert", async () => {
    const setup = await renderApp();
    const before = setup.captureCharFrame();
    await act(async () => {
      setup.mockInput.pressKey("w", { ctrl: true });
      setup.mockInput.pressKey("ARROW_LEFT", { meta: true });
    });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toBe(before);
    setup.renderer.destroy();
  });

  test("status bar shows @reboot jobs", async () => {
    const { captureCharFrame, renderer } = await renderApp();
    expect(captureCharFrame()).toContain("@reboot ×1");
    renderer.destroy();
  });
});

describe("App (week view)", () => {
  test("w switches to week view with hour grid", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.mockInput.pressKey("w");
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("· week");
    expect(frame).toContain("Sun 7");
    expect(frame).toContain("Sat 13");
    expect(frame).toMatch(/\b09\b/); // hour labels
    setup.renderer.destroy();
  });

  test("hour cursor filters the detail pane", async () => {
    const setup = await renderApp("week");
    const frame = setup.captureCharFrame();
    // Initial cursor hour is "now" — navigate to a known hour by checking the label exists
    expect(frame).toMatch(/\d{2}:00–\d{2}:59/);
    setup.renderer.destroy();
  });
});

describe("App (resize)", () => {
  test("month grid widens when the terminal grows", async () => {
    const setup = await renderApp();
    const before = setup.captureCharFrame();
    const headerBefore = before.split("\n").find((l) => l.includes("Sat"))!;

    await act(async () => {
      setup.resize(140, 45);
    });
    await setup.renderOnce();

    const after = setup.captureCharFrame();
    const headerAfter = after.split("\n").find((l) => l.includes("Sat"))!;
    expect(headerAfter.indexOf("Sat")).toBeGreaterThan(headerBefore.indexOf("Sat"));
    setup.renderer.destroy();
  });

  test("week view shows all 24 hours when the terminal is tall enough", async () => {
    const setup = await renderApp("week");
    await act(async () => {
      setup.resize(120, 45);
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain(" 00 ");
    expect(frame).toContain(" 23 ");
    expect(frame).not.toContain("⋮");
    setup.renderer.destroy();
  });

  test("week view shrinks the hour window on short terminals", async () => {
    const setup = await renderApp("week");
    await act(async () => {
      setup.resize(100, 24);
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("⋮");
    setup.renderer.destroy();
  });

  test("month view compacts cells instead of clipping on short terminals", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.resize(80, 24);
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("June 2026");
    // All six grid weeks must survive: Jun 1 (week 1) through Jun 30 (week 5) plus trailing Jul 4.
    expect(frame).toContain("30");
    expect(frame).toContain("Wednesday, June 10, 2026");
    setup.renderer.destroy();
  });
});

describe("App (fills the terminal)", () => {
  test("month grid columns stretch across a wide terminal", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.resize(150, 45);
    });
    await setup.renderOnce();
    const header = setup
      .captureCharFrame()
      .split("\n")
      .find((l) => l.includes("Sat"))!;
    expect(header.indexOf("Sat")).toBeGreaterThan(112); // last column starts past 75% of width
    setup.renderer.destroy();
  });

  test("week grid columns stretch across a wide terminal", async () => {
    const setup = await renderApp("week");
    await act(async () => {
      setup.resize(150, 45);
    });
    await setup.renderOnce();
    const header = setup
      .captureCharFrame()
      .split("\n")
      .find((l) => l.includes("Sat 13"))!;
    expect(header.indexOf("Sat 13")).toBeGreaterThan(112);
    setup.renderer.destroy();
  });

  test("month view: detail pane sits directly under the grid on tall terminals", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.resize(100, 45);
    });
    await setup.renderOnce();
    const lines = setup.captureCharFrame().split("\n");
    const title = lines.findIndex((l) => l.includes("Wednesday, June 10, 2026"));
    const lastDots = lines.reduce((acc, l, i) => (i < title && l.includes("●") ? i : acc), -1);
    expect(title).toBeGreaterThan(0);
    // At most the tail of the last (taller) cell plus the pane border between them.
    expect(title - lastDots).toBeLessThanOrEqual(6);
    setup.renderer.destroy();
  });

  test("week view: detail pane sits directly under the hour grid on tall terminals", async () => {
    const setup = await renderApp("week");
    await act(async () => {
      setup.resize(120, 45);
    });
    await setup.renderOnce();
    const lines = setup.captureCharFrame().split("\n");
    const title = lines.findIndex((l) => l.includes("Wednesday, June 10, 2026"));
    const hour23 = lines.findIndex((l) => /^\s{1,3}23 /.test(l));
    expect(hour23).toBeGreaterThan(0);
    expect(title - hour23).toBeLessThanOrEqual(3); // only the pane border between them
    setup.renderer.destroy();
  });
});

describe("App (minimum size)", () => {
  test("lists both dimensions when both are below minimum", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.resize(50, 15);
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("Terminal too small");
    expect(frame).toContain("width 50 < 66 minimum");
    expect(frame).toContain("height 15 < 22 minimum");
    expect(frame).not.toContain("Sun");
    setup.renderer.destroy();
  });

  test("reports only width when the terminal is narrow but tall", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.resize(50, 40);
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("width 50 < 66 minimum");
    expect(frame).not.toContain("height");
    setup.renderer.destroy();
  });

  test("reports only height when the terminal is wide but short", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.resize(100, 15);
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("height 15 < 22 minimum");
    expect(frame).not.toContain("width");
    setup.renderer.destroy();
  });

  test("recovers when resized back above the minimum", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.resize(50, 15);
    });
    await setup.renderOnce();
    await act(async () => {
      setup.resize(100, 38);
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).not.toContain("Terminal too small");
    expect(frame).toContain("June 2026");
    expect(frame).toContain("Sun");
    setup.renderer.destroy();
  });

  test("renders exactly at the minimum size", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.resize(66, 22);
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).not.toContain("Terminal too small");
    expect(frame).toContain("June 2026");
    expect(frame).toContain("Sat");
    setup.renderer.destroy();
  });
});

describe("App (12/24-hour clock)", () => {
  test("a toggles week-view hour labels to 12-hour and back", async () => {
    const setup = await renderApp("week");
    expect(setup.captureCharFrame()).toContain(" 09 ");
    await act(async () => {
      setup.mockInput.pressKey("a");
    });
    await setup.renderOnce();
    const twelve = setup.captureCharFrame();
    expect(twelve).toContain("12a");
    expect(twelve).toContain("12p");
    expect(twelve).not.toContain(" 09 ");
    await act(async () => {
      setup.mockInput.pressKey("a");
    });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain(" 09 ");
    setup.renderer.destroy();
  });

  test("detail pane times follow the clock format", async () => {
    const setup = await renderApp();
    expect(setup.captureCharFrame()).toContain("02:30");
    await act(async () => {
      setup.mockInput.pressKey("a");
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("2:30am");
    expect(frame).not.toContain("02:30");
    setup.renderer.destroy();
  });

  test("initialHourFormat=12 starts in 12-hour mode", async () => {
    const setup = await renderApp("week", "12");
    const frame = setup.captureCharFrame();
    expect(frame).toContain("12a");
    expect(frame).toMatch(/\d{1,2}:00[ap]m–\d{1,2}:59[ap]m/); // detail pane hour scope
    setup.renderer.destroy();
  });
});

describe("App (log peek)", () => {
  const dir = mkdtempSync(join(tmpdir(), "cronview-app-"));
  const logPath = join(dir, "job.log");
  writeFileSync(logPath, "backup started\nbackup finished\n");
  // Sorted by first run: 1 = logger (00:00), 2 = report (07:30), 3 = devnull (09:00).
  const logResult = parseCrontab(
    [
      `@daily logger-job >> ${logPath} 2>&1`,
      "30 7 * * * report-job --no-redirect",
      "0 9 * * * devnull-job > /dev/null",
    ].join("\n"),
  );

  async function renderLogApp() {
    const setup = await testRender(
      <App result={logResult} initialView="month" initialDate={june10} source="test" />,
      { width: 100, height: 38 },
    );
    await setup.renderOnce();
    return setup;
  }

  async function press(setup: Awaited<ReturnType<typeof renderLogApp>>, key: string) {
    await act(async () => {
      setup.mockInput.pressKey(key);
    });
    await setup.renderOnce();
  }

  test("detail pane numbers its job rows", async () => {
    const setup = await renderLogApp();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("1 ● ");
    expect(frame).toContain("2 ● ");
    expect(frame).toContain("3 ● ");
    setup.renderer.destroy();
  });

  test("the job overlay explains the schedule and lists upcoming runs", async () => {
    const setup = await renderLogApp();
    await press(setup, "1");
    const overlay = setup.captureCharFrame();
    expect(overlay).toContain("every day at 00:00"); // @daily explained
    expect(overlay).toMatch(/next: \w{3} \w{3} \d{1,2} \d{2}:\d{2}/);
    setup.renderer.destroy();
  });

  test("pressing a job's number opens its log tail; q returns to the calendar", async () => {
    const setup = await renderLogApp();
    await press(setup, "1");
    const overlay = setup.captureCharFrame();
    expect(overlay).toContain("backup started");
    expect(overlay).toContain("backup finished");
    expect(overlay).toContain(logPath);
    expect(overlay).not.toContain("June 2026"); // calendar replaced

    await press(setup, "q");
    const back = setup.captureCharFrame();
    expect(back).toContain("June 2026");
    expect(back).not.toContain("backup started");
    setup.renderer.destroy();
  });

  test("jobs without a redirect explain that cron mails output", async () => {
    const setup = await renderLogApp();
    await press(setup, "2");
    expect(setup.captureCharFrame()).toContain("cron mails");
    setup.renderer.destroy();
  });

  test("jobs redirecting to /dev/null explain the output is discarded", async () => {
    const setup = await renderLogApp();
    await press(setup, "3");
    expect(setup.captureCharFrame()).toContain("discarded");
    setup.renderer.destroy();
  });

  test("the job overlay shows run history with ran/missing marks", async () => {
    // logger-job is @daily; its most recent runs are at 00:00 today/yesterday.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
    const loggerCommand = logResult.jobs[0]!.command;
    const loadHistory = async () => ({
      records: [{ at: today, command: loggerCommand }], // ran today, no record yesterday
      coverageStart: new Date(yesterday.getTime() - 24 * 3600 * 1000),
    });
    const text = "";
    const setup = await testRender(
      <App
        result={logResult}
        initialView="month"
        initialDate={june10}
        source="test"
        initialText={text}
        loadHistory={loadHistory}
      />,
      { width: 120, height: 38 },
    );
    await setup.renderOnce();
    await act(async () => {}); // flush the async history load
    await press(setup, "1");
    const overlay = setup.captureCharFrame();
    expect(overlay).toContain("ran:");
    expect(overlay).toContain("✓");
    expect(overlay).toContain("✗");
    setup.renderer.destroy();
  });

  test("r reloads the open job's log in place", async () => {
    const path = join(dir, "refresh.log");
    writeFileSync(path, "first line\n");
    const result = parseCrontab(`@daily refresh-job >> ${path}`);
    const setup = await testRender(
      <App result={result} initialView="month" initialDate={june10} source="test" />,
      { width: 100, height: 38 },
    );
    await setup.renderOnce();
    await press(setup, "1");
    expect(setup.captureCharFrame()).toContain("first line");

    writeFileSync(path, "first line\nsecond line\n");
    await press(setup, "r");
    const frame = setup.captureCharFrame();
    expect(frame).toContain("second line");
    setup.renderer.destroy();
  });

  test("the ran line drops items rather than wrapping on narrow terminals", async () => {
    const loadHistory = async () => ({
      records: [],
      coverageStart: new Date(Date.now() - 7 * 24 * 3600 * 1000),
    });
    const setup = await testRender(
      <App
        result={logResult}
        initialView="month"
        initialDate={june10}
        source="test"
        loadHistory={loadHistory}
      />,
      { width: 70, height: 38 },
    );
    await setup.renderOnce();
    await act(async () => {});
    await press(setup, "1");
    const lines = setup.captureCharFrame().split("\n");
    const ranIdx = lines.findIndex((l) => l.includes("ran:"));
    const logIdx = lines.findIndex((l) => l.startsWith(" log"));
    expect(ranIdx).toBeGreaterThan(0);
    expect(logIdx).toBe(ranIdx + 1); // ran line stayed on one row — no wrap
    setup.renderer.destroy();
  });

  test("digits with no matching job are inert", async () => {
    const setup = await renderLogApp();
    const before = setup.captureCharFrame();
    await press(setup, "9");
    expect(setup.captureCharFrame()).toBe(before);
    setup.renderer.destroy();
  });
});

describe("App (live reload & edit)", () => {
  function makeCrontabFile(content: string) {
    const dir = mkdtempSync(join(tmpdir(), "cronview-reload-"));
    const path = join(dir, "crontab");
    writeFileSync(path, content);
    return path;
  }

  async function renderWatchedApp(path: string, runEditor?: () => void) {
    const text = readFileSync(path, "utf8");
    const setup = await testRender(
      <App
        result={parseCrontab(text)}
        initialView="month"
        initialDate={june10}
        source="test"
        initialText={text}
        readSource={() => readFileSync(path, "utf8")}
        pollMs={20}
        runEditor={runEditor}
      />,
      { width: 100, height: 38 },
    );
    await setup.renderOnce();
    return setup;
  }

  async function settle(setup: { renderOnce: () => Promise<unknown> }) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    await setup.renderOnce();
  }

  test("picks up crontab changes within a poll tick", async () => {
    const path = makeCrontabFile("@daily alpha-task\n");
    const setup = await renderWatchedApp(path);
    expect(setup.captureCharFrame()).toContain("alpha-task");

    writeFileSync(path, "@daily beta-task\n");
    await settle(setup);
    const frame = setup.captureCharFrame();
    expect(frame).toContain("beta-task");
    expect(frame).not.toContain("alpha-task");
    setup.renderer.destroy();
  });

  test("keeps the last good parse when the source becomes unreadable", async () => {
    const path = makeCrontabFile("@daily alpha-task\n");
    const setup = await renderWatchedApp(path);
    rmSync(path);
    await settle(setup);
    expect(setup.captureCharFrame()).toContain("alpha-task");
    setup.renderer.destroy();
  });

  test("e runs the editor and reloads immediately", async () => {
    const path = makeCrontabFile("@daily alpha-task\n");
    let edited = 0;
    const setup = await renderWatchedApp(path, () => {
      edited++;
      writeFileSync(path, "@daily gamma-task\n");
    });
    await act(async () => {
      setup.mockInput.pressKey("e");
    });
    await setup.renderOnce();
    expect(edited).toBe(1);
    expect(setup.captureCharFrame()).toContain("gamma-task");
    setup.renderer.destroy();
  });
});

describe("App (filter)", () => {
  async function typeKeys(setup: { mockInput: { pressKey: (k: string) => void }; renderOnce: () => Promise<unknown> }, keys: string[]) {
    for (const k of keys) {
      await act(async () => {
        setup.mockInput.pressKey(k);
        // A lone ESC byte is held by the input parser briefly to see whether
        // it starts an escape sequence; wait it out so the key is delivered.
        if (k === "ESCAPE") await new Promise((r) => setTimeout(r, 80));
      });
    }
    await setup.renderOnce();
  }

  test("/ then a query filters jobs everywhere", async () => {
    const setup = await renderApp();
    expect(setup.captureCharFrame()).toContain("health-check");

    await typeKeys(setup, ["/", "b", "a", "c", "k", "u", "p", "RETURN"]);
    const frame = setup.captureCharFrame();
    expect(frame).toContain("2 of 9 jobs"); // status bar filter indicator (both backup jobs)
    expect(frame).toContain("backup --incremental");
    expect(frame).not.toContain("health-check");
    setup.renderer.destroy();
  });

  test("escape clears an active filter", async () => {
    const setup = await renderApp();
    await typeKeys(setup, ["/", "b", "a", "c", "k", "u", "p", "RETURN"]);
    await typeKeys(setup, ["ESCAPE"]);
    const frame = setup.captureCharFrame();
    expect(frame).toContain("health-check");
    expect(frame).not.toContain("of 9 jobs");
    setup.renderer.destroy();
  });

  test("escape while typing cancels without applying", async () => {
    const setup = await renderApp();
    const before = setup.captureCharFrame();
    await typeKeys(setup, ["/", "x", "y", "ESCAPE"]);
    expect(setup.captureCharFrame()).toBe(before);
    setup.renderer.destroy();
  });

  test("digits typed into the query don't open the job view", async () => {
    const setup = await renderApp();
    await typeKeys(setup, ["/", "1"]);
    const frame = setup.captureCharFrame();
    expect(frame).not.toContain("ran:"); // no job overlay
    expect(frame).toContain("1▌"); // it went into the query buffer
    setup.renderer.destroy();
  });
});

describe("App (help overlay)", () => {
  test("? opens the keymap card and q closes it", async () => {
    const setup = await renderApp();
    expect(setup.captureCharFrame()).toContain("? help"); // advertised in the status bar
    await act(async () => {
      setup.mockInput.pressKey("?");
    });
    await setup.renderOnce();
    const overlay = setup.captureCharFrame();
    expect(overlay).toContain("12/24-hour clock");
    expect(overlay).toContain("filter jobs");
    expect(overlay).not.toContain("June 2026"); // calendar replaced

    await act(async () => {
      setup.mockInput.pressKey("q");
    });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("June 2026");
    setup.renderer.destroy();
  });

  test("other keys are inert while help is open", async () => {
    const setup = await renderApp();
    await act(async () => {
      setup.mockInput.pressKey("?");
    });
    await setup.renderOnce();
    const before = setup.captureCharFrame();
    await act(async () => {
      setup.mockInput.pressKey("w");
      setup.mockInput.pressKey("1");
    });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toBe(before);
    setup.renderer.destroy();
  });
});

describe("App (empty crontab)", () => {
  test("shows a friendly empty state", async () => {
    const empty = parseCrontab("");
    const setup = await testRender(
      <App result={empty} initialView="month" initialDate={june10} source="crontab -l" />,
      { width: 100, height: 38 },
    );
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("No cron jobs found");
    setup.renderer.destroy();
  });
});
