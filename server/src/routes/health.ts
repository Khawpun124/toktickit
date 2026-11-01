import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { logServerError } from "../http/log.js";

// GET /api/health/ready (api-spec section 10, BR-37). Public. It is mounted before the session
// middleware, so a database outage answers 503 here instead of failing the session lookup.
// GET /api/health stays where it was and is unchanged.

export const healthRouter = Router();

healthRouter.get("/api/health/ready", async (req: Request, res: Response) => {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready" });
  } catch (error) {
    logServerError(error, req);
    res.status(503).json({ status: "unavailable", code: "NOT_READY" });
  }
});
