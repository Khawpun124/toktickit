import type { Prisma, PrismaClient } from "@prisma/client";

// Ticket header returned by the Lab 4 status, owner, and priority endpoints and in a STALE_VERSION
// body (api-spec section 6). It never contains comments, notes, or attachments.

type Db = PrismaClient | Prisma.TransactionClient;

export const OPEN_ACTION_STATUSES = ["PLANNED", "IN_PROGRESS"] as const;

export interface TicketHeader {
  id: number;
  currentStatus: string;
  itPriority: string | null;
  ticketOwnerId: number | null;
  ticketOwnerName: string | null;
  problemAppearsResolved: boolean;
  version: number;
  resolvedAt: string | null;
  statusChangedAt: string;
  openActionsCount: number;
}

/** Fields every Lab 4 Ticket response adds (section 6, "Additive response fields"). */
export function workflowFields(t: { version: number; resolvedAt: Date | null; statusChangedAt: Date }) {
  return {
    version: t.version,
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    statusChangedAt: t.statusChangedAt.toISOString(),
  };
}

/** Actions Taken that are PLANNED or IN_PROGRESS: they block Resolved (BR-17). */
export function countOpenActions(db: Db, ticketId: number): Promise<number> {
  return db.actionTaken.count({ where: { ticketId, status: { in: [...OPEN_ACTION_STATUSES] } } });
}

export async function loadTicketHeader(db: Db, ticketId: number): Promise<TicketHeader | null> {
  const t = await db.ticket.findUnique({
    where: { id: ticketId },
    include: { ticketOwner: { select: { name: true } } },
  });
  if (!t) return null;
  return {
    id: t.id,
    currentStatus: t.currentStatus,
    itPriority: t.itPriority,
    ticketOwnerId: t.ticketOwnerId,
    ticketOwnerName: t.ticketOwner ? t.ticketOwner.name : null,
    problemAppearsResolved: t.problemAppearsResolved,
    ...workflowFields(t),
    openActionsCount: await countOpenActions(db, ticketId),
  };
}
