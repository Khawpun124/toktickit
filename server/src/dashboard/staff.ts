import type { PrismaClient, Role } from "@prisma/client";
import { ACTIVE_STATUSES, LIST_LIMIT, metric, statusQuery } from "./helpers.js";

// GET /api/dashboard/staff (api-spec section 9). "Me" is the session user. Counts cover all
// Tickets unless stated; `users` is added only for an Administrator.

const OPEN_ACTION_STATUSES = ["PLANNED", "IN_PROGRESS"] as const;

export async function buildStaffDashboard(prisma: PrismaClient, me: { id: number; role: Role }, generatedAt: Date) {
  const active = { currentStatus: { in: [...ACTIVE_STATUSES] } };
  const activeQuery = statusQuery(ACTIVE_STATUSES);
  const isAdmin = me.role === "ADMINISTRATOR";

  const [
    unassigned, myAssigned, newCount, inProgress, waiting, highPriority,
    myRecentTickets, myOpenActions, urgentTickets, activeUsers, inactiveUsers,
  ] = await prisma.$transaction(
    [
      prisma.ticket.count({ where: { ...active, ticketOwnerId: null } }),
      prisma.ticket.count({ where: { ...active, ticketOwnerId: me.id } }),
      prisma.ticket.count({ where: { currentStatus: "NEW" } }),
      prisma.ticket.count({ where: { currentStatus: "IN_PROGRESS" } }),
      prisma.ticket.count({ where: { currentStatus: "WAITING_FOR_REQUESTER" } }),
      prisma.ticket.count({ where: { ...active, itPriority: "HIGH" } }),
      prisma.ticket.findMany({
        where: { ticketOwnerId: me.id },
        select: { id: true, ticketNumber: true, summary: true, currentStatus: true, itPriority: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: LIST_LIMIT,
      }),
      prisma.actionTaken.findMany({
        where: { assigneeId: me.id, status: { in: [...OPEN_ACTION_STATUSES] } },
        select: {
          id: true, ticketId: true, description: true, status: true, actionAt: true,
          ticket: { select: { ticketNumber: true } },
        },
        orderBy: [{ actionAt: "asc" }, { id: "asc" }],
        take: LIST_LIMIT,
      }),
      prisma.ticket.findMany({
        where: { ...active, itPriority: "HIGH" },
        select: { id: true, ticketNumber: true, summary: true, currentStatus: true, itPriority: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: LIST_LIMIT,
      }),
      // Users card (Administrator only): every role, split by isActive, as /admin/users lists them.
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
    ],
    { isolationLevel: "RepeatableRead" }
  );

  const iso = <T extends { updatedAt: Date }>(t: T) => ({ ...t, updatedAt: t.updatedAt.toISOString() });

  return {
    generatedAt: generatedAt.toISOString(),
    metrics: {
      unassigned: metric(unassigned, `ticketOwnerId=unassigned&${activeQuery}`),
      myAssigned: metric(myAssigned, `ticketOwnerId=${me.id}&${activeQuery}`),
      new: metric(newCount, statusQuery(["NEW"])),
      inProgress: metric(inProgress, statusQuery(["IN_PROGRESS"])),
      waitingForRequester: metric(waiting, statusQuery(["WAITING_FOR_REQUESTER"])),
      highPriority: metric(highPriority, `itPriority=HIGH&${activeQuery}`),
    },
    myRecentTickets: myRecentTickets.map(iso),
    myOpenActions: myOpenActions.map(a => ({
      id: a.id,
      ticketId: a.ticketId,
      ticketNumber: a.ticket.ticketNumber,
      description: a.description,
      status: a.status,
      actionAt: a.actionAt.toISOString(),
    })),
    urgentTickets: urgentTickets.map(iso),
    ...(isAdmin ? { users: { active: activeUsers, inactive: inactiveUsers } } : {}),
  };
}
