import type { Request } from "express";

// The one server-side error log (api-spec section 0, "App-level safe errors"). It records the real
// cause of a failure for the operator and nothing that could carry user data: the error's name, its
// Prisma code when it has one, the last line of its message (cut at 300 characters), and the method
// and route of the request. It never records a request body, a cookie, a header, or a password.
// The client only ever receives the safe `{ error, code }` body.
//
// Why only the last line: a Prisma error message is several lines long. Before the cause on the
// last line it repeats the calling source code and, for validation errors, the query arguments,
// which can hold an email address or a passwordHash.

export const MAX_CAUSE_LENGTH = 300;

export interface ServerErrorEntry {
  at: string;
  method: string;
  route: string;
  name: string;
  /** Prisma's error code (for example P2002) when the error has one. */
  code?: string;
  /** The last non-empty line of the message, at most MAX_CAUSE_LENGTH characters. */
  message: string;
}

/**
 * Where entries go. Tests replace or spy on `write`. It is silent under NODE_ENV=test, so test
 * output stays clean unless a test captures it.
 */
export const serverLog = {
  write(entry: ServerErrorEntry): void {
    if (process.env.NODE_ENV === "test") return;
    const code = entry.code ? ` [${entry.code}]` : "";
    console.error(`[${entry.at}] ${entry.method} ${entry.route} ${entry.name}${code}: ${entry.message}`);
  },
};

/** The route pattern when Express matched one (no ids), otherwise the path without its query. */
function routeOf(req: Request): string {
  const saved = req.res?.locals?.errorRoute;
  if (typeof saved === "string") return saved;
  const pattern = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof pattern === "string") return `${req.baseUrl ?? ""}${pattern}`;
  return (req.originalUrl ?? req.url ?? "").split("?")[0];
}

/** The cause line of a message: its last non-empty line, trimmed and cut to MAX_CAUSE_LENGTH. */
export function causeLine(message: string): string {
  const lines = message.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return (lines[lines.length - 1] ?? "").slice(0, MAX_CAUSE_LENGTH);
}

export function logServerError(error: unknown, req: Request): void {
  const err = error instanceof Error ? (error as Error & { code?: unknown }) : undefined;
  const code = typeof err?.code === "string" && /^P\d{4}$/.test(err.code) ? err.code : undefined;
  serverLog.write({
    at: new Date().toISOString(),
    method: req.method,
    route: routeOf(req),
    name: err?.name ?? typeof error,
    ...(code ? { code } : {}),
    message: causeLine(err ? err.message : String(error)),
  });
}
