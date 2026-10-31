import type { PrismaClient, TicketStatus } from "@prisma/client";
import { LIST_LIMIT, REQUESTER_OPEN_STATUSES, metric, recentlyResolvedSince, statusQuery } from "./helpers.js";

// GET /api/dashboard/requester (api-spec section 8). Everything is scoped to `requesterId`, which
// the route takes from the session (BR-30). `generatedAt` is the single instant of the request
// and reaches the database only as a bound parameter (BR-28).

const RESOLVED_OR_CLOSED: TicketStatus[] = ["RESOLVED", "CLOSED"];

const LIST_SELECT = {
  id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true,
} as const;

export async function buildRequesterDashboard(prisma: PrismaClient, requesterId: number, generatedAt: Date) {
  const since = recentlyResolvedSince(generatedAt);
  const own = { requesterId };

  // One snapshot for every count and list, so a card and its list never disagree mid-request.
  const [open, waiting, resolved, closed, needsAttention, recentlyUpdated, recentlyResolved] = await prisma.$transaction(
    [
      prisma.ticket.count({ where: { ...own, currentStatus: { in: [...REQUESTER_OPEN_STATUSES] } } }),
      prisma.ticket.count({ where: { ...own, currentStatus: "WAITING_FOR_REQUESTER" } }),
      prisma.ticket.count({ where: { ...own, currentStatus: "RESOLVED" } }),
      prisma.ticket.count({ where: { ...own, currentStatus: "CLOSED" } }),
      // BR-39: longest waiting first, measured from the last status transition.
      prisma.ticket.findMany({
        where: { ...own, currentStatus: "WAITING_FOR_REQUESTER" },
        select: { ...LIST_SELECT, statusChangedAt: true },
        orderBy: [{ statusChangedAt: "asc" }, { id: "asc" }],
        take: LIST_LIMIT,
      }),
      prisma.ticket.findMany({
        where: own,
        select: LIST_SELECT,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: LIST_LIMIT,
      }),
      prisma.ticket.findMany({
        where: { ...own, currentStatus: { in: RESOLVED_OR_CLOSED }, resolvedAt: { gte: since, lte: generatedAt } },
        select: { ...LIST_SELECT, resolvedAt: true },
        orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
        take: LIST_LIMIT,
      }),
    ],
    { isolationLevel: "RepeatableRead" }
  );

  return {
    generatedAt: generatedAt.toISOString(),
    recentlyResolvedSince: since.toISOString(),
    metrics: {
      open: metric(open, statusQuery(REQUESTER_OPEN_STATUSES)),
      waitingForYou: metric(waiting, statusQuery(["WAITING_FOR_REQUESTER"])),
      resolved: metric(resolved, statusQuery(["RESOLVED"])),
      closed: metric(closed, statusQuery(["CLOSED"])),
    },
    needsAttention: needsAttention.map(({ statusChangedAt, ...t }) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      currentStatus: t.currentStatus,
      waitingSince: statusChangedAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    recentlyUpdated: recentlyUpdated.map(t => ({ ...t, updatedAt: t.updatedAt.toISOString() })),
    recentlyResolved: recentlyResolved.map(t => ({
      ...t,
      updatedAt: t.updatedAt.toISOString(),
      resolvedAt: t.resolvedAt!.toISOString(),
    })),
  };
}
