import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { internalError, sendError } from "./errors.js";
import { logServerError } from "./log.js";

// App-level safe errors (api-spec section 0, BR-33). These answer only what an endpoint did not
// answer itself, so the 4xx and 5xx bodies that Lab 1-3 handlers send are unchanged. No answer
// contains a stack trace, SQL, a file path, or an HTML page, whatever NODE_ENV is.

/**
 * Express 4 does not catch a promise that an async handler rejects; the request would hang.
 * Wrapping the handler at its registration passes the rejection to next(), so the error handler
 * below answers 500. The handler itself is unchanged.
 */
export function forwardRejections(handler: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => {
    // The matched pattern is read now: by the time the error handler runs, Express may have moved on.
    const pattern = (req.route as { path?: unknown } | undefined)?.path;
    Promise.resolve(handler(req, res, next)).catch(error => {
      if (typeof pattern === "string") res.locals.errorRoute = pattern;
      next(error);
    });
  };
}

/** An /api path that no route matched. */
export const apiNotFound: RequestHandler = (_req, res) => {
  sendError(res, 404, "NOT_FOUND", "Not found");
};

type BodyParserError = Error & { type?: string; status?: number; expose?: boolean };

/** Installed last. Logs the real cause and answers with a safe body. */
export const appErrorHandler: ErrorRequestHandler = (error: BodyParserError, req, res, next) => {
  logServerError(error, req);
  if (res.headersSent) {
    // Too late for a body: let Express close the connection.
    next(error);
    return;
  }
  if (error?.type === "entity.parse.failed") {
    sendError(res, 400, "VALIDATION_FAILED", "Request body is not valid JSON.");
    return;
  }
  if (error?.type === "entity.too.large") {
    sendError(res, 413, "VALIDATION_FAILED", "Request body is too large.");
    return;
  }
  if (error?.expose && typeof error.status === "number" && error.status >= 400 && error.status < 500) {
    // Other request-body problems the parser reports (unsupported charset or encoding, aborted body).
    sendError(res, error.status, "VALIDATION_FAILED", "Request body could not be read.");
    return;
  }
  internalError(res);
};
