// Build a standalone cronview executable with Bun.
// Usage: bun scripts/build.ts [bun-darwin-arm64|bun-darwin-x64|bun-linux-x64|bun-linux-arm64|...] [outfile]
// Defaults to the current platform and ./dist/cronview.

const hostTarget = `bun-${process.platform}-${process.arch === "arm64" ? "arm64" : "x64"}`;
const target = process.argv[2] ?? hostTarget;
const outfile = process.argv[3] ?? "./dist/cronview";

// Linux builds must pin the libc branch so only one native package is embedded.
const define: Record<string, string> = {};
if (target.includes("linux")) {
  define["process.env.OPENTUI_LIBC"] = JSON.stringify(target.includes("musl") ? "musl" : "glibc");
}

console.log(`building ${outfile} for ${target}…`);
const result = await Bun.build({
  entrypoints: ["./src/index.tsx"],
  target: "bun",
  define,
  compile: {
    target: target as any,
    outfile,
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log("done");
