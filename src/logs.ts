import { closeSync, openSync, readSync, statSync } from "node:fs";

/** Where a cron job's stdout ends up, derived from its command line. */
export type OutputTarget =
  | { kind: "file"; path: string; append: boolean }
  | { kind: "discard" }
  | { kind: "mail" };

/**
 * Find the last stdout redirect in a command — `>> path`, `> path`, `1> path`
 * (skipping `2>` stderr and `2>&1` dups), with quoted targets kept whole and
 * `>` inside quoted arguments ignored. Crontab `NAME=value` lines take
 * precedence over the process environment when expanding `~` and `$VAR`s.
 */
export function outputTarget(command: string, env: Record<string, string>): OutputTarget {
  let target: { path: string; append: boolean } | null = null;
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c !== ">") continue;

    const fd = /\d/.test(command[i - 1] ?? "") ? command[i - 1]! : "";
    const append = command[i + 1] === ">";
    let j = i + (append ? 2 : 1);
    i = j - 1; // resume scanning after the operator either way
    while (j < command.length && command[j] === " ") j++;
    if (command[j] === "&") continue; // dup like 2>&1 / >&2, not a file
    if (fd === "2") continue; // stderr only

    let word = "";
    const q = command[j];
    if (q === '"' || q === "'") {
      j++;
      while (j < command.length && command[j] !== q) word += command[j++];
      j++;
    } else {
      while (j < command.length && !/[\s>&|;]/.test(command[j]!)) word += command[j++];
    }
    if (!word) continue;
    target = { path: word, append };
    i = j - 1;
  }
  if (!target) return { kind: "mail" };
  const path = expand(target.path, env);
  if (path === "/dev/null") return { kind: "discard" };
  return { kind: "file", path, append: target.append };
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
