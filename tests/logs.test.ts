import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outputTarget, readLogTail } from "../src/logs";

describe("outputTarget", () => {
  test(">> file is an appending file target", () => {
    expect(outputTarget("backup --full >> /var/log/backup.log 2>&1", {})).toEqual({
      kind: "file",
      path: "/var/log/backup.log",
      append: true,
    });
  });

  test("> file is an overwriting file target", () => {
    expect(outputTarget("task > /tmp/out.log", {})).toEqual({
      kind: "file",
      path: "/tmp/out.log",
      append: false,
    });
  });

  test("/dev/null means discarded", () => {
    expect(outputTarget("noisy > /dev/null 2>&1", {})).toEqual({ kind: "discard" });
  });

  test("no redirect means cron mails the output", () => {
    expect(outputTarget("echo 'hello'", {})).toEqual({ kind: "mail" });
  });

  test("stderr-only redirect still mails stdout", () => {
    expect(outputTarget("task 2>> /tmp/errors.log", {})).toEqual({ kind: "mail" });
  });

  test("2>&1 alone is not a file target", () => {
    expect(outputTarget("task 2>&1", {})).toEqual({ kind: "mail" });
  });

  test("quoted paths keep their spaces", () => {
    expect(outputTarget(`task >> "/var/log/my app.log"`, {})).toEqual({
      kind: "file",
      path: "/var/log/my app.log",
      append: true,
    });
  });

  test("$HOME expands from crontab env first", () => {
    expect(outputTarget("task >> $HOME/cron.log", { HOME: "/Users/x" })).toEqual({
      kind: "file",
      path: "/Users/x/cron.log",
      append: true,
    });
  });

  test("${VAR} braces expand too", () => {
    expect(outputTarget("task > ${LOGDIR}/task.log", { LOGDIR: "/srv/logs" })).toEqual({
      kind: "file",
      path: "/srv/logs/task.log",
      append: false,
    });
  });

  test("~ expands to HOME", () => {
    expect(outputTarget("task >> ~/cron.log", { HOME: "/Users/x" })).toEqual({
      kind: "file",
      path: "/Users/x/cron.log",
      append: true,
    });
  });

  test("> inside quotes is not a redirect", () => {
    expect(outputTarget(`echo "a > b" | mail ops`, {})).toEqual({ kind: "mail" });
    expect(outputTarget(`echo 'x >> y'`, {})).toEqual({ kind: "mail" });
  });

  test("a real redirect after a quoted > still wins", () => {
    expect(outputTarget(`echo "a > b" >> /tmp/out.log`, {})).toEqual({
      kind: "file",
      path: "/tmp/out.log",
      append: true,
    });
  });

  test("the last stdout redirect wins", () => {
    expect(outputTarget("a > /tmp/a.log && b >> /tmp/b.log", {})).toEqual({
      kind: "file",
      path: "/tmp/b.log",
      append: true,
    });
  });
});

describe("readLogTail", () => {
  const dir = mkdtempSync(join(tmpdir(), "cronview-logs-"));

  test("returns trailing lines and file size", () => {
    const p = join(dir, "a.log");
    writeFileSync(p, "one\ntwo\nthree\n");
    expect(readLogTail(p)).toEqual({ lines: ["one", "two", "three"], size: 14 });
  });

  test("caps the number of lines, keeping the newest", () => {
    const p = join(dir, "b.log");
    writeFileSync(p, Array.from({ length: 600 }, (_, i) => `line ${i}`).join("\n"));
    const tail = readLogTail(p, 500);
    expect(tail!.lines.length).toBe(500);
    expect(tail!.lines[499]).toBe("line 599");
    expect(tail!.lines[0]).toBe("line 100");
  });

  test("empty file gives no lines", () => {
    const p = join(dir, "c.log");
    writeFileSync(p, "");
    expect(readLogTail(p)).toEqual({ lines: [], size: 0 });
  });

  test("missing file returns null", () => {
    expect(readLogTail(join(dir, "nope.log"))).toBeNull();
  });
});
