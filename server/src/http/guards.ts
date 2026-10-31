import type { NextFunction, Request, Response } from "express";
import { sendError } from "./errors.js";

/**
 * Lab 4 versions of the Lab 3 guards in middleware/auth.ts. The `error` texts are the same
 * character for character; only `code` is added (api-spec section 0). auth.ts itself is not
 * changed, because Lab 1-3 tests compare some of those bodies exactly.
 *
 * Use in this order (check order steps 1-3): authenticated, passwordChanged, staffOnly.
 */

export function authenticated(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    sendError(res, 401, "UNAUTHENTICATED", "Unauthorized");
    return;
  }
  next();
}

export function passwordChanged(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    sendError(res, 401, "UNAUTHENTICATED", "Unauthorized");
    return;
  }
  if (req.user.mustChangePassword) {
    sendError(res, 403, "PASSWORD_CHANGE_REQUIRED", "Password change required before accessing this resource");
    return;
  }
  next();
}

// IT Staff and Administrators only.
export function staffOnly(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    sendError(res, 401, "UNAUTHENTICATED", "Unauthorized");
    return;
  }
  if (req.user.role !== "IT_STAFF" && req.user.role !== "ADMINISTRATOR") {
    sendError(res, 403, "FORBIDDEN", "Forbidden");
    return;
  }
  next();
}
