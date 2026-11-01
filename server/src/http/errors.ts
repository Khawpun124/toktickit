import type { Response } from "express";

/**
 * Lab 4 error responses (api-spec section 0): { error, code, fields? } plus any extra
 * top-level fields a code defines (for example `from`/`to` or `currentVersion`).
 * Used only by Lab 4 endpoints; Lab 1-3 endpoints keep their original bodies.
 */
export type ErrorCode =
  | "VALIDATION_FAILED"
  | "INVALID_TRANSITION"
  | "UNAUTHENTICATED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STALE_VERSION"
  | "TICKET_NOT_ACCEPTING_ACTIONS"
  | "ACTION_TERMINAL"
  | "OPEN_ACTIONS_BLOCK_RESOLUTION"
  | "INTERNAL_ERROR";

export type FieldErrors = Record<string, string>;

export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  error: string,
  extra: Record<string, unknown> = {}
): void {
  res.status(status).json({ error, code, ...extra });
}

export function validationFailed(res: Response, fields: FieldErrors, error = "Validation failed"): void {
  sendError(res, 400, "VALIDATION_FAILED", error, Object.keys(fields).length > 0 ? { fields } : {});
}

export function notFound(res: Response, error: string): void {
  sendError(res, 404, "NOT_FOUND", error);
}

// Never includes the caught error: no stack trace, SQL, or file path reaches the client.
export function internalError(res: Response): void {
  if (res.headersSent) return;
  sendError(res, 500, "INTERNAL_ERROR", "Unexpected error. Please try again.");
}
