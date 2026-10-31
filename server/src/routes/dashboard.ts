import { Router, type NextFunction, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { authenticated, passwordChanged, staffOnly } from "../http/guards.js";
import { internalError, sendError } from "../http/errors.js";
import { dashboardNow } from "../dashboard/clock.js";
import { buildRequesterDashboard } from "../dashboard/requester.js";
import { buildStaffDashboard } from "../dashboard/staff.js";

// Lab 4 dashboards (api-spec sections 8, 9, 11). Check order: 401, 403 PASSWORD_CHANGE_REQUIRED,
// 403 FORBIDDEN. Figures come from the database on every request; nothing is cached (BR-26).
// The user always comes from the session; any user id in the query or body is ignored (BR-30).

export const dashboardRouter = Router();

function requesterOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.user!.role !== "REQUESTER") {
    sendError(res, 403, "FORBIDDEN", "Forbidden");
    return;
  }
  next();
}

dashboardRouter.get("/api/dashboard/requester", authenticated, passwordChanged, requesterOnly, async (req: Request, res: Response) => {
  try {
    res.json(await buildRequesterDashboard(getPrisma(), req.user!.id, dashboardNow()));
  } catch {
    internalError(res);
  }
});

dashboardRouter.get("/api/dashboard/staff", authenticated, passwordChanged, staffOnly, async (req: Request, res: Response) => {
  try {
    res.json(await buildStaffDashboard(getPrisma(), { id: req.user!.id, role: req.user!.role }, dashboardNow()));
  } catch {
    internalError(res);
  }
});
