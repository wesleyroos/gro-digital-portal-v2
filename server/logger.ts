/**
 * Circular in-memory log buffer. Intercepts console.log/warn/error/info
 * and keeps the last MAX_ENTRIES entries so they can be streamed to the
 * admin UI via the system.getLogs tRPC procedure.
 */

const MAX_ENTRIES = 600;

export type LogLevel = "log" | "info" | "warn" | "error";

export interface LogEntry {
  ts: number;      // Unix ms
  level: LogLevel;
  msg: string;
}

const buffer: LogEntry[] = [];

function formatArgs(args: unknown[]): string {
  return args
    .map(a => {
      if (a === null) return "null";
      if (a === undefined) return "undefined";
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(" ");
}

function push(level: LogLevel, args: unknown[]) {
  const msg = formatArgs(args);
  buffer.push({ ts: Date.now(), level, msg });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function installLogInterceptor() {
  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args: unknown[]) => { orig.log(...args); push("log", args); };
  console.info = (...args: unknown[]) => { orig.info(...args); push("info", args); };
  console.warn = (...args: unknown[]) => { orig.warn(...args); push("warn", args); };
  console.error = (...args: unknown[]) => { orig.error(...args); push("error", args); };
}

/** Returns all buffered log entries, newest last. */
export function getLogs(): LogEntry[] {
  return [...buffer];
}

/** Returns entries after a given timestamp (exclusive). */
export function getLogsSince(afterTs: number): LogEntry[] {
  return buffer.filter(e => e.ts > afterTs);
}
