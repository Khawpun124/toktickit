import type { Request } from "express";

// The one server-side error log (api-spec section 0, "App-level safe errors"). It records the real
// cause of a failure for the operator: the error's name and message, and the method and route of
// the request. It never records a request body, a cookie, a header, or a password. The client only
// ever receives the safe `{ error, code }` body.

export interface ServerErrorEntry {
  at: string;
  method: string;
  route: string;
  name: string;
  message: string;
}

/**
 * Where entries go. Tests replace or spy on `write`. It is silent under NODE_ENV=test, so test
 * output stays clean unless a test captures it.
 */
export const serverLog = {
  write(entry: ServerErrorEntry): void {
    if (process.env.NODE_ENV === "test") return;
    console.error(`[${entry.at}] ${entry.method} ${entry.route} ${entry.name}: ${entry.message}`);
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

export function logServerError(error: unknown, req: Request): void {
  const err = error instanceof Error ? error : undefined;
  serverLog.write({
    at: new Date().toISOString(),
    method: req.method,
    route: routeOf(req),
    name: err?.name ?? typeof error,
    message: err?.message ?? String(error),
  });
}
