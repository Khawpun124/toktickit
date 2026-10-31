import type { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { countOpenActions, loadTicketHeader, OPEN_ACTION_STATUSES, type TicketHeader } from "./header.js";
import { isAllowedTicketTransition } from "./transitions.js";

// Ticket workflow (BR-16 to BR-22). Every decision is made inside one transaction that holds the
// Ticket row lock, so a racing Action creation (which takes the same lock) is applied either fully
// before or fully after it (BR-14, AC-17). The stored status is the only "from" (BR-21).

export const AUTO_CANCEL_RESULT = "Cancelled automatically because the Ticket was cancelled.";

export type WorkflowOutcome =
  | { kind: "notFound" }
  | { kind: "stale"; current: TicketHeader }
  | { kind: "invalidTransition"; from: string; to: unknown }
  | { kind: "gate"; openActionsCount: number }
  | { kind: "ok"; header: TicketHeader; cancelledActionsCount?: number };

type Tx = Prisma.TransactionClient;

/** Locks the Ticket row for the rest of the transaction and returns its status and version. */
async function lockTicket(tx: Tx, ticketId: number) {
  const rows = await tx.$queryRaw<{ currentStatus: string; version: number }[]>`
    SELECT "currentStatus"::text AS "currentStatus", version FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
  return rows[0];
}

/** Compare-and-set on the version that was read under the lock (BR-22). */
async function writeTicket(tx: Tx, ticketId: number, version: number, data: Prisma.TicketUpdateManyMutationInput) {
  const result = await tx.ticket.updateMany({
    where: { id: ticketId, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (result.count !== 1) throw new Error("Ticket compare-and-set failed under the row lock");
}

/**
 * Check order for this endpoint (api-spec section 0, exception): STALE_VERSION, then
 * INVALID_TRANSITION from the stored status, then the resolution gate for a permitted pair.
 */
export function changeTicketStatus(ticketId: number, newStatus: unknown, expectedVersion?: number): Promise<WorkflowOutcome> {
  return getPrisma().$transaction(async tx => {
    const locked = await lockTicket(tx, ticketId);
    if (!locked) return { kind: "notFound" };

    if (expectedVersion !== undefined && expectedVersion !== locked.version) {
      return { kind: "stale", current: (await loadTicketHeader(tx, ticketId))! };
    }
    if (!isAllowedTicketTransition(locked.currentStatus, newStatus)) {
      return { kind: "invalidTransition", from: locked.currentStatus, to: newStatus };
    }
    if (newStatus === "RESOLVED") {
      const openActionsCount = await countOpenActions(tx, ticketId);
      if (openActionsCount > 0) return { kind: "gate", openActionsCount };
    }

    let cancelledActionsCount: number | undefined;
    if (newStatus === "CANCELLED") {
      const cancelled = await tx.actionTaken.updateMany({
        where: { ticketId, status: { in: [...OPEN_ACTION_STATUSES] } },
        data: { status: "CANCELLED", result: AUTO_CANCEL_RESULT, version: { increment: 1 } },
      });
      cancelledActionsCount = cancelled.count;
    }

    const now = new Date();
    await writeTicket(tx, ticketId, locked.version, {
      currentStatus: newStatus,
      // BR-39: statusChangedAt records the server time of every status transition.
      statusChangedAt: now,
      // BR-19: Resolved sets resolvedAt; Reopened clears it and resets the advisory flag.
      ...(newStatus === "RESOLVED" ? { resolvedAt: now } : {}),
      ...(newStatus === "REOPENED" ? { resolvedAt: null, problemAppearsResolved: false } : {}),
    });

    const header = (await loadTicketHeader(tx, ticketId))!;
    return cancelledActionsCount === undefined ? { kind: "ok", header } : { kind: "ok", header, cancelledActionsCount };
  });
}

/** Owner or IT Priority update with the optional expectedVersion (section 6, BR-22). */
export function updateTicketFields(
  ticketId: number,
  data: Pick<Prisma.TicketUncheckedUpdateManyInput, "ticketOwnerId" | "itPriority">,
  expectedVersion?: number,
): Promise<WorkflowOutcome> {
  return getPrisma().$transaction(async tx => {
    const locked = await lockTicket(tx, ticketId);
    if (!locked) return { kind: "notFound" };
    if (expectedVersion !== undefined && expectedVersion !== locked.version) {
      return { kind: "stale", current: (await loadTicketHeader(tx, ticketId))! };
    }
    await writeTicket(tx, ticketId, locked.version, data);
    return { kind: "ok", header: (await loadTicketHeader(tx, ticketId))! };
  });
}

/**
 * Reads `expectedVersion` from a body: absent (Lab 3 compatibility) gives undefined; anything other
 * than a positive integer is a malformed value (400 VALIDATION_FAILED at check-order step 5).
 */
export function readExpectedVersion(body: unknown): { ok: true; value?: number } | { ok: false } {
  const raw = (body as { expectedVersion?: unknown } | undefined)?.expectedVersion;
  if (raw === undefined) return { ok: true };
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return { ok: true, value: raw };
  return { ok: false };
}
