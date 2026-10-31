import request from "supertest";
import { Prisma, type Priority, type TicketStatus } from "@prisma/client";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

/**
 * Shared pieces of the Issue 5 dashboard tests. Test users are created with createFixture(tag,
 * "dashtest") and removed by its cleanup(); nothing here touches the Lab 4 seed (l4-*, TKT-L4-*).
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_MS = 30 * DAY_MS;
export const ACTIVE = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const;

export const dashApi = {
  requester: (cookie: string, query = "") => request(app).get(`/api/dashboard/requester${query}`).set("Cookie", cookie),
  staff: (cookie: string, query = "") => request(app).get(`/api/dashboard/staff${query}`).set("Cookie", cookie),
  myTickets: (cookie: string, query: string) => request(app).get(`/api/tickets?${query}`).set("Cookie", cookie),
  queue: (cookie: string, query: string) => request(app).get(`/api/staff/tickets?${query}`).set("Cookie", cookie),
};

/** Sets columns the API never lets a test set directly (explicit updatedAt overrides @updatedAt). */
export async function setTicket(
  id: number,
  data: {
    status?: TicketStatus; statusChangedAt?: Date; resolvedAt?: Date | null; updatedAt?: Date;
    itPriority?: Priority | null; ownerId?: number | null; requesterId?: number;
  }
): Promise<void> {
  await getPrisma().ticket.update({
    where: { id },
    data: {
      ...(data.status !== undefined && { currentStatus: data.status }),
      ...(data.statusChangedAt !== undefined && { statusChangedAt: data.statusChangedAt }),
      ...(data.resolvedAt !== undefined && { resolvedAt: data.resolvedAt }),
      ...(data.itPriority !== undefined && { itPriority: data.itPriority }),
      ...(data.ownerId !== undefined && { ticketOwnerId: data.ownerId }),
      ...(data.requesterId !== undefined && { requesterId: data.requesterId }),
      updatedAt: data.updatedAt ?? new Date(),
    },
  });
}

/** Independent count straight from SQL (not the dashboard code), for API-30 and API-32. */
export async function sqlCount(where: Prisma.Sql): Promise<number> {
  const rows = await getPrisma().$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM "Ticket" WHERE ${where}`);
  return Number(rows[0].n);
}

/** Independent list of Ticket ids straight from SQL. */
export async function sqlTicketIds(where: Prisma.Sql, orderBy: Prisma.Sql, limit = 5): Promise<number[]> {
  const rows = await getPrisma().$queryRaw<{ id: number }[]>(
    Prisma.sql`SELECT id FROM "Ticket" WHERE ${where} ORDER BY ${orderBy} LIMIT ${limit}`
  );
  return rows.map(r => r.id);
}

/** `"currentStatus"::text IN (...)` for raw SQL. */
export function statusIn(statuses: readonly string[]): Prisma.Sql {
  return Prisma.sql`"currentStatus"::text IN (${Prisma.join([...statuses])})`;
}
