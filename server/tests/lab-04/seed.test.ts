import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/utils/password.js";
import { MIGRATED_USER_INITIAL_PASSWORD } from "../../src/constants.js";
import { LAB4_TICKETS, LAB4_USERS, seedLab4 } from "../../prisma/seed-lab4.js";

/**
 * MIG-04 (AC-27, BR-38): the Lab 4 seed is idempotent and complete.
 *
 * Runs the Lab 4 part of the seed twice, then checks the result. It touches only the Lab 4
 * users and the TKT-L4- Tickets, which no other test file uses; the Lab 1-3 part of the seed
 * is not re-run here because it resets the Lab 1-3 users that other test files log in as.
 * Users and Tickets are looked up by email and ticketNumber, never by id.
 */
describe("MIG-04: Lab 4 seed is idempotent and complete", () => {
  const prisma = getPrisma();
  const emails: string[] = Object.values(LAB4_USERS).map(u => u.email);
  const ticketNumbers = LAB4_TICKETS.map(t => t.ticketNumber);

  beforeAll(async () => {
    const hash = await hashPassword(MIGRATED_USER_INITIAL_PASSWORD);
    await seedLab4(prisma, hash);
    await seedLab4(prisma, hash);
  });

  it("creates each Lab 4 user, Ticket, and Action exactly once after two runs", async () => {
    expect(await prisma.user.count({ where: { email: { in: emails } } })).toBe(emails.length);
    expect(await prisma.ticket.count({ where: { ticketNumber: { startsWith: "TKT-L4-" } } })).toBe(ticketNumbers.length);

    const tickets = await prisma.ticket.findMany({
      where: { ticketNumber: { in: ticketNumbers } },
      select: { ticketNumber: true, _count: { select: { actionsTaken: true } } },
    });
    const actionCounts = Object.fromEntries(tickets.map(t => [t.ticketNumber, t._count.actionsTaken]));
    expect(actionCounts).toEqual(Object.fromEntries(LAB4_TICKETS.map(t => [t.ticketNumber, t.actions.length])));
  });

  it("covers every Ticket status, every priority, and owned and unowned Tickets", async () => {
    const tickets = await prisma.ticket.findMany({ where: { ticketNumber: { in: ticketNumbers } } });
    expect(new Set(tickets.map(t => t.currentStatus))).toEqual(new Set([
      "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
    ]));
    expect(new Set(tickets.map(t => t.requestedPriority))).toEqual(new Set(["LOW", "MEDIUM", "HIGH"]));
    expect(new Set(tickets.map(t => t.itPriority))).toEqual(new Set([null, "LOW", "MEDIUM", "HIGH"]));
    expect(tickets.some(t => t.ticketOwnerId === null)).toBe(true);
    expect(tickets.some(t => t.ticketOwnerId !== null)).toBe(true);
  });

  it("has Tickets with 0, 1, and several Actions, every Action status, and a follow-up", async () => {
    const tickets = await prisma.ticket.findMany({
      where: { ticketNumber: { in: ticketNumbers } },
      include: { actionsTaken: true },
    });
    const counts = tickets.map(t => t.actionsTaken.length);
    expect(counts).toContain(0);
    expect(counts).toContain(1);
    expect(counts.some(c => c > 1)).toBe(true);

    const actions = tickets.flatMap(t => t.actionsTaken);
    expect(new Set(actions.map(a => a.status))).toEqual(new Set(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]));
    const followUp = actions.filter(a => a.followUpRequired);
    expect(followUp.length).toBeGreaterThan(0);
    for (const a of followUp) expect(a.followUpNote?.trim().length).toBeGreaterThanOrEqual(5);

    // BR-14: no unfinished Action on a resolved, closed, or cancelled Ticket.
    for (const t of tickets.filter(t => ["RESOLVED", "CLOSED", "CANCELLED"].includes(t.currentStatus))) {
      expect(t.actionsTaken.filter(a => a.status === "PLANNED" || a.status === "IN_PROGRESS"), t.ticketNumber).toEqual([]);
    }
  });

  it("has a Requester with no Tickets and a Requester with many, and only Lab 4 users on seeded Tickets", async () => {
    const empty = await prisma.user.findUniqueOrThrow({
      where: { email: LAB4_USERS.dashRequesterEmpty.email },
      include: { _count: { select: { tickets: true } } },
    });
    const many = await prisma.user.findUniqueOrThrow({
      where: { email: LAB4_USERS.dashRequesterMany.email },
      include: { _count: { select: { tickets: true } } },
    });
    expect(empty._count.tickets).toBe(0);
    expect(many._count.tickets).toBeGreaterThanOrEqual(ticketNumbers.length);

    const tickets = await prisma.ticket.findMany({
      where: { ticketNumber: { in: ticketNumbers } },
      include: { requester: true, ticketOwner: true, actionsTaken: { include: { performedBy: true, assignee: true } } },
    });
    const lab4Emails = new Set(emails);
    for (const t of tickets) {
      expect(lab4Emails.has(t.requester.email), t.ticketNumber).toBe(true);
      if (t.ticketOwner) expect(lab4Emails.has(t.ticketOwner.email), t.ticketNumber).toBe(true);
      for (const a of t.actionsTaken) {
        expect(lab4Emails.has(a.performedBy.email)).toBe(true);
        expect(lab4Emails.has(a.assignee.email)).toBe(true);
      }
    }
  });

  it("gives the waiting Tickets distinct statusChangedAt values in a different order from updatedAt", async () => {
    const waiting = await prisma.ticket.findMany({
      where: { ticketNumber: { in: ticketNumbers }, currentStatus: "WAITING_FOR_REQUESTER" },
    });
    expect(waiting.length).toBeGreaterThanOrEqual(2);
    const byWait = [...waiting].sort((a, b) => a.statusChangedAt.getTime() - b.statusChangedAt.getTime() || a.id - b.id);
    const byUpdate = [...waiting].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id - b.id);
    expect(new Set(waiting.map(t => t.statusChangedAt.getTime())).size).toBe(waiting.length);
    expect(byWait.map(t => t.id)).not.toEqual(byUpdate.map(t => t.id));
  });

  it("keeps the seeded updatedAt of TKT-L4-0004: newest update of 0004-0006 but the longest wait (AC-38)", async () => {
    const rows = await prisma.ticket.findMany({
      where: { ticketNumber: { in: ["TKT-L4-0004", "TKT-L4-0005", "TKT-L4-0006"] } },
    });
    const t = Object.fromEntries(rows.map(r => [r.ticketNumber, r]));
    expect(Object.keys(t).sort()).toEqual(["TKT-L4-0004", "TKT-L4-0005", "TKT-L4-0006"]);
    for (const other of ["TKT-L4-0005", "TKT-L4-0006"]) {
      expect(t["TKT-L4-0004"].updatedAt.getTime(), `updatedAt 0004 > ${other}`).toBeGreaterThan(t[other].updatedAt.getTime());
      expect(t["TKT-L4-0004"].statusChangedAt.getTime(), `statusChangedAt 0004 < ${other}`).toBeLessThan(t[other].statusChangedAt.getTime());
    }
  });

  it("gives RESOLVED and CLOSED Tickets a resolvedAt and every other status none", async () => {
    const tickets = await prisma.ticket.findMany({ where: { ticketNumber: { in: ticketNumbers } } });
    for (const t of tickets) {
      const resolved = t.currentStatus === "RESOLVED" || t.currentStatus === "CLOSED";
      expect(t.resolvedAt !== null, t.ticketNumber).toBe(resolved);
    }
  });
});
