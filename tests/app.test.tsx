import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { parseCrontab } from "../src/crontab";
import { App } from "../src/ui/App";

const sample = readFileSync(join(import.meta.dir, "../examples/sample.crontab"), "utf8");
const result = parseCrontab(sample);

// Fixed reference date: Wednesday, June 10, 2026.
const june10 = new Date(2026, 5, 10);

async function renderApp(view: "month" | "week" = "month") {
  const setup = await testRender(
    <App result={result} initialView={view} initialDate={june10} source="sample" />,
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
    for (const key of ["h", "j", "k", "l", "v", "x", "n", "1", " ", "RETURN", "TAB"]) {
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
