export interface CronJob {
  /** Stable index within the crontab, used for color assignment. */
  id: number;
  /** The schedule exactly as written, e.g. "0,30 * * * *" or "@daily". */
  schedule: string;
  /** Normalized 5-field cron expression. */
  expression: string;
  command: string;
  /** 1-based line number in the source crontab. */
  line: number;
  color: string;
  /** IANA zone from a preceding CRON_TZ= line; runs are scheduled in it. */
  tz?: string;
  /** Run-as user (system crontabs only). */
  user?: string;
  /** Origin file for system crontab jobs, e.g. "/etc/cron.d/certbot". */
  source?: string;
}

export interface RebootJob {
  command: string;
  line: number;
}

export interface ParseWarning {
  line: number;
  text: string;
  error: string;
}

export interface ParseResult {
  jobs: CronJob[];
  reboots: RebootJob[];
  warnings: ParseWarning[];
  env: Record<string, string>;
}

export type ViewMode = "month" | "week";

export type HourFormat = "24" | "12";
