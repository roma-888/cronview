// Dev tool: render a cronview frame to stdout without a TTY.
// Usage: bun scripts/frame.tsx [month|week] [WIDTHxHEIGHT]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { parseCrontab } from "../src/crontab";
import { App } from "../src/ui/App";

const sample = readFileSync(join(import.meta.dir, "../examples/sample.crontab"), "utf8");
const result = parseCrontab(sample);
const june10 = new Date(2026, 5, 10);

const view = (process.argv[2] === "week" ? "week" : "month") as "month" | "week";
const size = /^(\d+)x(\d+)$/.exec(process.argv[3] ?? "");
const width = size ? Number(size[1]) : 100;
const height = size ? Number(size[2]) : 36;

const setup = await testRender(
  <App result={result} initialView={view} initialDate={june10} source="sample" />,
  { width, height },
);
await setup.renderOnce();
console.log(setup.captureCharFrame());
setup.renderer.destroy();
process.exit(0);
