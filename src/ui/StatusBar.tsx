import type { ParseResult, ViewMode } from "../types";
import { UI } from "./theme";

interface StatusBarProps {
  view: ViewMode;
  result: ParseResult;
}

export function StatusBar({ view, result }: StatusBarProps) {
  const vertical = view === "month" ? "week" : "hour";
  const bracket = view === "month" ? "month" : "week";
  const keys = ` ←→ day · ↑↓ ${vertical} · [ ] ${bracket} · m/w view · t today · a 12/24 · q quit`;

  const notes: string[] = [];
  if (result.warnings.length > 0) {
    notes.push(`⚠ ${result.warnings.length} line${result.warnings.length === 1 ? "" : "s"} skipped`);
  }
  if (result.reboots.length > 0) {
    notes.push(`@reboot ×${result.reboots.length}`);
  }

  return (
    <box style={{ flexDirection: "row", justifyContent: "space-between", height: 1 }}>
      <text fg={UI.dim}>{keys}</text>
      <text>
        {result.warnings.length > 0 ? <span fg={UI.warn}>{notes[0]} </span> : null}
        {result.reboots.length > 0 ? (
          <span fg={UI.dim}>{`${notes[notes.length - 1]} `}</span>
        ) : null}
      </text>
    </box>
  );
}
