// Dev helper: render the app at a given size and dump the char frame.
// Usage: bun scripts/preview-frame.tsx [width] [height] [month|week]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { parseCrontab } from "../src/crontab";
import { App } from "../src/ui/App";

const width = Number(process.argv[2] ?? 136);
const height = Number(process.argv[3] ?? 45);
const view = (process.argv[4] ?? "month") as "month" | "week";

const sample = readFileSync(join(import.meta.dir, "../examples/sample.crontab"), "utf8");
const result = parseCrontab(sample);
const setup = await testRender(
  <App result={result} initialView={view} initialDate={new Date(2026, 5, 10)} source="sample" />,
  { width, height },
);
await setup.renderOnce();
console.log(setup.captureCharFrame().split("\n").map((l, i) => `${String(i).padStart(2)}|${l}`).join("\n"));
setup.renderer.destroy();
process.exit(0);
