import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { requireAuth, requirePasswordChanged } from "../middleware/auth.js";
import { sendError, validationFailed } from "../http/errors.js";
import {
  changeTicketStatus, readExpectedVersion, updateTicketFields, type WorkflowOutcome,
} from "../tickets/workflow.js";

// Lab 4 Ticket owner, IT Priority, and status endpoints (api-spec section 6). These were Lab 3
// endpoints: their Lab 3 error texts and their 401/403/404 bodies (no `code`) are kept, the 404 check
// comes before the 400 checks, and only the errors section 6 names carry a `code`.

export const ticketWorkflowRouter = Router();

const STALE_TICKET = "This ticket was changed by someone else. Reload it to see the latest version.";

/** Lab 3 steps shared by the three endpoints: role, then a Ticket that exists (404 before 400). */
async function findStaffTicket(req: Request, res: Response): Promise<number | null> {
  if (req.user!.role === "REQUESTER") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  const ticketId = parseInt(req.params.id, 10);
  if (isNaN(ticketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return null;
  }
  const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return null;
  }
  return ticketId;
}

/** Reads the optional expectedVersion; a malformed one is answered here with 400 (ok: false). */
function expectedVersionOf(req: Request, res: Response): { ok: true; value?: number } | { ok: false } {
  const parsed = readExpectedVersion(req.body);
  if (!parsed.ok) validationFailed(res, { expectedVersion: "expectedVersion must be a positive integer." });
  return parsed;
}

/** Sends the response for a workflow outcome. */
function sendOutcome(res: Response, outcome: WorkflowOutcome): void {
  switch (outcome.kind) {
    case "notFound":
      res.status(404).json({ error: "Ticket not found" });
      return;
    case "stale":
      sendError(res, 409, "STALE_VERSION", STALE_TICKET, {
        currentVersion: outcome.current.version,
        current: outcome.current,
      });
      return;
    case "invalidTransition":
      sendError(res, 400, "INVALID_TRANSITION", "Invalid status transition", { from: outcome.from, to: outcome.to });
      return;
    case "gate":
      sendError(
        res, 409, "OPEN_ACTIONS_BLOCK_RESOLUTION",
        `${outcome.openActionsCount} unfinished action(s) must be completed or cancelled before this ticket can be resolved.`,
        { openActionsCount: outcome.openActionsCount },
      );
      return;
    case "ok":
      res.status(200).json(
        outcome.cancelledActionsCount === undefined
          ? outcome.header
          : { ...outcome.header, cancelledActionsCount: outcome.cancelledActionsCount },
      );
  }
}

// Endpoint 13 — PATCH /api/staff/tickets/:id/owner (BR-08, BR-09; Lab 4 version)
ticketWorkflowRouter.patch("/api/staff/tickets/:id/owner", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  try {
    const ticketId = await findStaffTicket(req, res);
    if (ticketId === null) return;

    const { ticketOwnerId } = req.body as { ticketOwnerId: number | null };
    if (ticketOwnerId !== null && ticketOwnerId !== undefined) {
      const targetUser = await getPrisma().user.findUnique({ where: { id: ticketOwnerId } });
      if (!targetUser || !targetUser.isActive || (targetUser.role !== "IT_STAFF" && targetUser.role !== "ADMINISTRATOR")) {
        res.status(400).json({ error: "Target user is not an active IT Staff or Administrator" });
        return;
      }
    }
    const expected = expectedVersionOf(req, res);
    if (!expected.ok) return;

    sendOutcome(res, await updateTicketFields(ticketId, { ticketOwnerId: ticketOwnerId ?? null }, expected.value));
  } catch (error) {
    res.status(500).json({ error: "Unable to update ticket owner" });
  }
});

// Endpoint 14 — PATCH /api/staff/tickets/:id/priority (BR-10; Lab 4 version)
ticketWorkflowRouter.patch("/api/staff/tickets/:id/priority", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  try {
    const ticketId = await findStaffTicket(req, res);
    if (ticketId === null) return;

    const { itPriority } = req.body as { itPriority: string };
    if (!itPriority || !["LOW", "MEDIUM", "HIGH"].includes(itPriority)) {
      res.status(400).json({ error: "Invalid priority value. Must be LOW, MEDIUM, or HIGH." });
      return;
    }
    const expected = expectedVersionOf(req, res);
    if (!expected.ok) return;

    sendOutcome(res, await updateTicketFields(ticketId, { itPriority: itPriority as "LOW" | "MEDIUM" | "HIGH" }, expected.value));
  } catch (error) {
    res.status(500).json({ error: "Unable to update IT priority" });
  }
});

// Endpoint 15 — PATCH /api/staff/tickets/:id/status (BR-16 to BR-22)
ticketWorkflowRouter.patch("/api/staff/tickets/:id/status", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  try {
    const ticketId = await findStaffTicket(req, res);
    if (ticketId === null) return;

    // Only newStatus is read: a "from" status claimed by the client is never used (BR-21).
    const { newStatus } = req.body as { newStatus: string };
    if (!newStatus) {
      res.status(400).json({ error: "newStatus is required" });
      return;
    }
    const expected = expectedVersionOf(req, res);
    if (!expected.ok) return;

    sendOutcome(res, await changeTicketStatus(ticketId, newStatus, expected.value));
  } catch (error) {
    res.status(500).json({ error: "Unable to update ticket status" });
  }
});
