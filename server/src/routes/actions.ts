import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { authenticated, passwordChanged, staffOnly } from "../http/guards.js";
import { internalError, notFound, sendError, validationFailed, type FieldErrors } from "../http/errors.js";
import { ACTION_INCLUDE, toActionResource, type ActionWithPeople } from "../actions/resource.js";
import { decideTransition, isTerminal, type ActionStatusValue } from "../actions/status.js";
import {
  MESSAGES, isUuid, planEdit, planStatusChange,
  validateCreate, validateEditRequest, validateStatusRequest,
} from "../actions/validation.js";

/**
 * Lab 4 Actions Taken endpoints (api-spec sections 2-5). Every handler follows the check
 * order of api-spec section 0: 401, 403 PASSWORD_CHANGE_REQUIRED, 403 FORBIDDEN, 404,
 * (4a replay, create only), 400 request, 409, 400 stored state.
 *
 * None of these handlers writes the Ticket row: creating or editing an Action leaves the
 * Ticket's updatedAt, statusChangedAt, and version unchanged (like comments and notes).
 * There is no DELETE route (BR-12).
 */
export const actionsRouter = Router();

const ACCEPTING_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
const MAX_INT = 2147483647;

const TICKET_NOT_FOUND = "Ticket not found";
const ACTION_NOT_FOUND = "Action not found";
const CLIENT_REQUEST_ID_OTHER_TICKET = "This clientRequestId was already used for another ticket.";
const ACTION_TERMINAL = "This action is completed or cancelled and can no longer be changed.";
const STALE_VERSION = "This action was changed by someone else. Reload it to see the latest version.";

// Path ids: digits only and within the Int column range; anything else is a 404.
function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_INT ? n : null;
}

async function loadAction(id: number): Promise<ActionWithPeople | null> {
  return getPrisma().actionTaken.findUnique({ where: { id }, include: ACTION_INCLUDE });
}

// BR-04: the assignee must be an active IT Staff or Administrator.
async function assigneeIsValid(userId: number): Promise<boolean> {
  const u = await getPrisma().user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  return !!u && u.isActive && (u.role === "IT_STAFF" || u.role === "ADMINISTRATOR");
}

function sendTerminal(res: Response): void {
  sendError(res, 409, "ACTION_TERMINAL", ACTION_TERMINAL);
}

function sendStale(res: Response, current: ActionWithPeople): void {
  sendError(res, 409, "STALE_VERSION", STALE_VERSION, {
    currentVersion: current.version,
    current: toActionResource(current),
  });
}

/** Step 4a: answers a replay of (current user, clientRequestId). Returns true if it answered. */
async function answerReplay(res: Response, userId: number, clientRequestId: string, ticketId: number): Promise<boolean> {
  const existing = await getPrisma().actionTaken.findUnique({
    where: { performedById_clientRequestId: { performedById: userId, clientRequestId } },
    include: ACTION_INCLUDE,
  });
  if (!existing) return false;
  if (existing.ticketId === ticketId) res.status(200).json(toActionResource(existing));
  else validationFailed(res, { clientRequestId: CLIENT_REQUEST_ID_OTHER_TICKET });
  return true;
}

/**
 * After a compare-and-set changed no row, reports why: the Action is gone (404), became
 * terminal (409 ACTION_TERMINAL), or has another version (409 STALE_VERSION).
 */
async function answerLostUpdate(res: Response, id: number): Promise<void> {
  const current = await loadAction(id);
  if (!current) notFound(res, ACTION_NOT_FOUND);
  else if (isTerminal(current.status)) sendTerminal(res);
  else sendStale(res, current);
}

// ─── GET /api/tickets/:id/actions ────────────────────────────────────────────

actionsRouter.get("/api/tickets/:id/actions", authenticated, passwordChanged, async (req: Request, res: Response) => {
  try {
    const ticketId = parseId(req.params.id);
    const ticket = ticketId
      ? await getPrisma().ticket.findUnique({ where: { id: ticketId }, select: { id: true, requesterId: true } })
      : null;
    // A Requester gets the same 404 for another Requester's Ticket as for a missing one.
    if (!ticket || (req.user!.role === "REQUESTER" && ticket.requesterId !== req.user!.id)) {
      notFound(res, TICKET_NOT_FOUND);
      return;
    }
    const actions = await getPrisma().actionTaken.findMany({
      where: { ticketId: ticket.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: ACTION_INCLUDE,
    });
    res.status(200).json(actions.map(toActionResource));
  } catch {
    internalError(res);
  }
});

// ─── POST /api/staff/tickets/:id/actions ─────────────────────────────────────

actionsRouter.post("/api/staff/tickets/:id/actions", authenticated, passwordChanged, staffOnly, async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const userId = req.user!.id;
    const now = new Date();

    // 4. Ticket exists
    const ticketId = parseId(req.params.id);
    const ticket = ticketId ? await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } }) : null;
    if (!ticket) {
      notFound(res, TICKET_NOT_FOUND);
      return;
    }

    // 4a. Replay, before validation and state checks
    const rawKey = req.body?.clientRequestId;
    if (isUuid(rawKey) && (await answerReplay(res, userId, rawKey.toLowerCase(), ticket.id))) return;

    // 5. Request validation, including the assignee lookup
    const input = validateCreate(req.body, now);
    const fields: FieldErrors = input.ok ? {} : { ...input.fields };
    const assigneeId = input.ok ? input.value.assigneeId ?? userId : null;
    if (assigneeId !== null && !(await assigneeIsValid(assigneeId))) fields.assigneeId = MESSAGES.assigneeId;
    if (!input.ok || Object.keys(fields).length > 0) {
      validationFailed(res, fields);
      return;
    }
    const v = input.value;

    // 6. Lock the Ticket row, check it accepts Actions, create (BR-13, api-spec Concurrency)
    let outcome:
      | { kind: "created"; action: ActionWithPeople }
      | { kind: "missing" }
      | { kind: "closed"; ticketStatus: string };
    try {
      outcome = await prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ currentStatus: string }>>`
          SELECT "currentStatus"::text AS "currentStatus" FROM "Ticket" WHERE id = ${ticket.id} FOR UPDATE`;
        if (rows.length === 0) return { kind: "missing" as const };
        if (!ACCEPTING_STATUSES.includes(rows[0].currentStatus)) {
          return { kind: "closed" as const, ticketStatus: rows[0].currentStatus };
        }
        const action = await tx.actionTaken.create({
          data: {
            ticketId: ticket.id,
            actionAt: v.actionAt,
            description: v.description,
            result: v.result,
            performedById: userId,
            assigneeId: assigneeId!,
            status: v.status,
            followUpRequired: v.followUpRequired,
            followUpNote: v.followUpNote,
            attachmentNotes: v.attachmentNotes,
            clientRequestId: v.clientRequestId,
          },
          include: ACTION_INCLUDE,
        });
        return { kind: "created" as const, action };
      });
    } catch (e) {
      // A parallel request with the same (user, clientRequestId) won the unique index.
      // The failed transaction is already rolled back, so look the winner up and replay it.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && v.clientRequestId) {
        if (await answerReplay(res, userId, v.clientRequestId, ticket.id)) return;
      }
      throw e;
    }

    if (outcome.kind === "missing") notFound(res, TICKET_NOT_FOUND);
    else if (outcome.kind === "closed") {
      sendError(res, 409, "TICKET_NOT_ACCEPTING_ACTIONS", "This ticket no longer accepts actions. Reopen it first.", {
        ticketStatus: outcome.ticketStatus,
      });
    } else res.status(201).json(toActionResource(outcome.action));
  } catch {
    internalError(res);
  }
});

// ─── PATCH /api/staff/actions/:actionId ──────────────────────────────────────

actionsRouter.patch("/api/staff/actions/:actionId", authenticated, passwordChanged, staffOnly, async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // 4. Action exists
    const id = parseId(req.params.actionId);
    const stored = id ? await loadAction(id) : null;
    if (!stored) {
      notFound(res, ACTION_NOT_FOUND);
      return;
    }

    // 5. Request validation, including the assignee lookup
    const request = validateEditRequest(req.body);
    if (!request.ok) {
      validationFailed(res, request.fields, request.error);
      return;
    }
    const { expectedVersion, patch } = request.value;
    if (patch.assigneeId !== undefined && !(await assigneeIsValid(patch.assigneeId))) {
      validationFailed(res, { assigneeId: MESSAGES.assigneeId });
      return;
    }

    // 6. Terminal, then stale
    if (isTerminal(stored.status)) {
      sendTerminal(res);
      return;
    }
    if (stored.version !== expectedVersion) {
      sendStale(res, stored);
      return;
    }

    // 7. Rules that need the stored Action
    const plan = planEdit(stored, patch, now);
    if (!plan.ok) {
      validationFailed(res, plan.fields, plan.error);
      return;
    }

    // Compare-and-set: changes nothing unless the version is still the one checked above.
    const { count } = await getPrisma().actionTaken.updateMany({
      where: { id: stored.id, version: expectedVersion, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      data: { ...plan.value, version: { increment: 1 }, updatedAt: now },
    });
    if (count === 0) {
      await answerLostUpdate(res, stored.id);
      return;
    }
    res.status(200).json(toActionResource((await loadAction(stored.id))!));
  } catch {
    internalError(res);
  }
});

// ─── PATCH /api/staff/actions/:actionId/status ───────────────────────────────

actionsRouter.patch("/api/staff/actions/:actionId/status", authenticated, passwordChanged, staffOnly, async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // 4. Action exists
    const id = parseId(req.params.actionId);
    const stored = id ? await loadAction(id) : null;
    if (!stored) {
      notFound(res, ACTION_NOT_FOUND);
      return;
    }

    // 5. Request validation
    const request = validateStatusRequest(req.body);
    if (!request.ok) {
      validationFailed(res, request.fields, request.error);
      return;
    }
    const { expectedVersion, status: to, result: sentResult } = request.value;

    // 6. Terminal, then stale
    if (isTerminal(stored.status)) {
      sendTerminal(res);
      return;
    }
    if (stored.version !== expectedVersion) {
      sendStale(res, stored);
      return;
    }

    // 7. Transition pair, then the Result and actionAt rules
    const from = stored.status as ActionStatusValue;
    const decision = decideTransition(from, to);
    if (decision.kind === "invalid") {
      sendError(res, 400, "INVALID_TRANSITION", "Invalid status transition", { from: decision.from, to: decision.to });
      return;
    }
    const plan = planStatusChange(stored, to, sentResult, now);
    if (!plan.ok) {
      validationFailed(res, plan.fields, plan.error);
      return;
    }

    const { count } = await getPrisma().actionTaken.updateMany({
      where: { id: stored.id, version: expectedVersion, status: from },
      data: { status: to, result: plan.value.result, version: { increment: 1 }, updatedAt: now },
    });
    if (count === 0) {
      await answerLostUpdate(res, stored.id);
      return;
    }
    res.status(200).json(toActionResource((await loadAction(stored.id))!));
  } catch {
    internalError(res);
  }
});
