export const UI = {
  accent: "#5fd7ff",
  dim: "#7a7a7a",
  faint: "#4a4a4a",
  today: "#87ff87",
  selectionBg: "#2d4f67",
  headerBg: "#20304a",
  warn: "#ff8787",
  text: "#e0e0e0",
} as const;

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return n <= 1 ? "…" : s.slice(0, n - 1) + "…";
}

export function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

export function formatCount(n: number): string {
  return n >= 1000 ? `${Math.floor(n / 1000)}k+` : String(n);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
