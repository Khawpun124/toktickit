import request from "supertest";
import type { Priority, Role, TicketStatus } from "@prisma/client";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/utils/password.js";

/**
 * Shared fixture for the Lab 4 API tests. Each test file creates its own users and Tickets
 * with a unique run id (emails "act-<runId>-...", never "l4-", so the Lab 4 seed is never
 * touched) and removes everything it created in afterAll.
 */
export const TEST_PASSWORD = "ActionTest123!";

export type TestUser = { id: number; name: string; email: string; cookie: string };

const USER_SPECS = {
  staffA: { role: "IT_STAFF", isActive: true, mustChangePassword: false },
  staffB: { role: "IT_STAFF", isActive: true, mustChangePassword: false },
  requesterA: { role: "REQUESTER", isActive: true, mustChangePassword: false },
  requesterB: { role: "REQUESTER", isActive: true, mustChangePassword: false },
  admin: { role: "ADMINISTRATOR", isActive: true, mustChangePassword: false },
  inactiveStaff: { role: "IT_STAFF", isActive: false, mustChangePassword: false },
  mustChangeRequester: { role: "REQUESTER", isActive: true, mustChangePassword: true },
  mustChangeStaff: { role: "IT_STAFF", isActive: true, mustChangePassword: true },
} as const satisfies Record<string, { role: Role; isActive: boolean; mustChangePassword: boolean }>;

type UserKey = keyof typeof USER_SPECS;

export type Fixture = {
  runId: string;
  users: Record<UserKey, TestUser>;
  createTicket(opts?: { requester?: UserKey; owner?: UserKey | null; status?: TicketStatus; priority?: Priority }): Promise<number>;
  trackTicket(id: number): void;
  cleanup(): Promise<void>;
};

export async function login(email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.headers["set-cookie"]?.[0] ?? "";
}

export async function createFixture(tag: string): Promise<Fixture> {
  const prisma = getPrisma();
  const runId = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const userIds: number[] = [];
  const ticketIds: number[] = [];

  const users = {} as Record<UserKey, TestUser>;
  for (const [key, spec] of Object.entries(USER_SPECS) as Array<[UserKey, (typeof USER_SPECS)[UserKey]]>) {
    const email = `act-${runId}-${key.toLowerCase()}@example.com`;
    const u = await prisma.user.create({
      data: { name: `Act ${key}`, email, passwordHash, ...spec },
    });
    userIds.push(u.id);
    users[key] = { id: u.id, name: u.name, email, cookie: spec.isActive ? await login(email) : "" };
  }

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } });
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } });
  let seq = 0;

  return {
    runId,
    users,
    async createTicket(opts = {}) {
      const t = await prisma.ticket.create({
        data: {
          ticketNumber: `TKT-ACT-${runId}-${++seq}`,
          requesterId: users[opts.requester ?? "requesterA"].id,
          ticketOwnerId: opts.owner ? users[opts.owner].id : null,
          categoryId: category.id,
          relatedSystemId: system.id,
          summary: `Action test ticket ${seq}`,
          description: "Ticket created by a Lab 4 API test.",
          requestedPriority: opts.priority ?? "MEDIUM",
          currentStatus: opts.status ?? "OPEN",
        },
      });
      ticketIds.push(t.id);
      return t.id;
    },
    trackTicket(id) {
      ticketIds.push(id);
    },
    async cleanup() {
      // ActionTaken first (its foreign keys restrict deletes), then the Ticket children, Tickets, sessions, users.
      await prisma.actionTaken.deleteMany({
        where: { OR: [{ ticketId: { in: ticketIds } }, { performedById: { in: userIds } }, { assigneeId: { in: userIds } }] },
      });
      await prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await prisma.ticket.deleteMany({ where: { OR: [{ id: { in: ticketIds } }, { requesterId: { in: userIds } }] } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    },
  };
}

/** A random UUID (v4 format). */
export function uuid(): string {
  return crypto.randomUUID();
}

// Request helpers bound to the app
export const api = {
  list: (cookie: string, ticketId: number | string) =>
    request(app).get(`/api/tickets/${ticketId}/actions`).set("Cookie", cookie),
  create: (cookie: string, ticketId: number | string, body: Record<string, unknown>) =>
    request(app).post(`/api/staff/tickets/${ticketId}/actions`).set("Cookie", cookie).send(body),
  edit: (cookie: string, actionId: number | string, body: Record<string, unknown>) =>
    request(app).patch(`/api/staff/actions/${actionId}`).set("Cookie", cookie).send(body),
  status: (cookie: string, actionId: number | string, body: Record<string, unknown>) =>
    request(app).patch(`/api/staff/actions/${actionId}/status`).set("Cookie", cookie).send(body),
};

/** An id that no Ticket or Action has (larger than every existing one, within Int range). */
export async function missingId(model: "ticket" | "actionTaken"): Promise<number> {
  const prisma = getPrisma();
  const agg = model === "ticket"
    ? await prisma.ticket.aggregate({ _max: { id: true } })
    : await prisma.actionTaken.aggregate({ _max: { id: true } });
  return (agg._max.id ?? 0) + 100000;
}
