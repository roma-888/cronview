import { closeSync, openSync, readSync, statSync } from "node:fs";

/** Where a cron job's stdout ends up, derived from its command line. */
export type OutputTarget =
  | { kind: "file"; path: string; append: boolean }
  | { kind: "discard" }
  | { kind: "mail" };

// A redirect operator with an optional fd prefix and its target word:
// `>> path`, `> path`, `1> path`, `2>> path`, `&> path`, quoted paths included.
const REDIRECT = /(\d?)(>>|>)\s*("(?:[^"]*)"|'(?:[^']*)'|\S+)/g;

/**
 * Find the last stdout redirect in a command. Crontab `NAME=value` lines take
 * precedence over the process environment when expanding `~` and `$VAR`s.
 */
export function outputTarget(command: string, env: Record<string, string>): OutputTarget {
  let target: { path: string; append: boolean } | null = null;
  for (const m of command.matchAll(REDIRECT)) {
    const [, fd, op, word] = m as unknown as [string, string, string, string];
    if (fd === "2") continue; // stderr only
    if (word.startsWith("&")) continue; // dup like 2>&1 / >&2, not a file
    target = { path: unquote(word), append: op === ">>" };
  }
  if (!target) return { kind: "mail" };
  const path = expand(target.path, env);
  if (path === "/dev/null") return { kind: "discard" };
  return { kind: "file", path, append: target.append };
}

function unquote(word: string): string {
  const q = word[0];
  if ((q === '"' || q === "'") && word.endsWith(q) && word.length >= 2) {
    return word.slice(1, -1);
  }
  return word;
}

function expand(path: string, env: Record<string, string>): string {
  const get = (name: string) => env[name] ?? process.env[name];
  let p = path.replace(/\$\{(\w+)\}|\$(\w+)/g, (whole, braced, bare) => {
    return get(braced ?? bare) ?? whole;
  });
  if (p.startsWith("~/") || p === "~") {
    const home = get("HOME");
    if (home) p = home + p.slice(1);
  }
  return p;
}

export interface LogTail {
  lines: string[];
  /** Total file size in bytes (not just the portion read). */
  size: number;
}

const TAIL_BYTES = 256 * 1024;

/** Read the trailing lines of a log file, or null if it can't be read. */
export function readLogTail(path: string, maxLines = 500): LogTail | null {
  try {
    const size = statSync(path).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    let read = 0;
    if (len > 0) {
      const fd = openSync(path, "r");
      try {
        // The file may shrink between stat and read; trust what was read.
        read = readSync(fd, buf, 0, len, size - len);
      } finally {
        closeSync(fd);
      }
    }
    let lines = read > 0 ? buf.toString("utf8", 0, read).split("\n") : [];
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    if (size > len) lines.shift(); // first line may be cut mid-way
    if (lines.length > maxLines) lines = lines.slice(-maxLines);
    return { lines, size };
  } catch {
    return null;
  }
}
