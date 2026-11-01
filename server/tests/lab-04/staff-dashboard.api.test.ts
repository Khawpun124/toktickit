import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, type ActionStatus, type Priority, type TicketStatus } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { createFixture, type Fixture } from "./helpers.js";
import { ACTIVE, DAY_MS, dashApi, setTicket, sqlCount, sqlTicketIds, statusIn } from "./dashboard-support.js";

/**
 * GET /api/dashboard/staff: API-31, API-32, API-33, API-34, API-35 (staff cards). Counts cover all
 * Tickets, so they are compared with SQL run right after the request (test files run one at a
 * time). "Me" lists use this file's own users, so their expected rows are known exactly.
 */
describe("Staff dashboard (API-31 to API-35)", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  const t: Record<string, number> = {};
  const act: Record<string, number> = {};

  async function ticket(key: string, status: TicketStatus, cols: Parameters<typeof setTicket>[1] = {}) {
    t[key] = await fx.createTicket({ requester: "requesterA", status });
    await setTicket(t[key], cols);
  }

  async function action(key: string, ticketId: number, assignee: number, status: ActionStatus, actionAt: Date) {
    const row = await prisma.actionTaken.create({
      data: {
        ticketId, actionAt, description: `Dashboard test action ${key}`, status,
        result: status === "COMPLETED" || status === "CANCELLED" ? "Finished for the dashboard test" : null,
        performedById: fx.users.staffA.id, assigneeId: assignee,
      },
    });
    act[key] = row.id;
  }

  beforeAll(async () => {
    fx = await createFixture("staffdash", "dashtest");
    const me = fx.users.staffA.id;
    const other = fx.users.staffB.id;
    const day = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * DAY_MS);

    // My recent Tickets: seven owned by me, any status; two share the newest updatedAt
    const mine: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "CANCELLED"];
    for (const [i, s] of mine.entries()) await ticket(`mine${i}`, s, { ownerId: me, updatedAt: day(i) });
    await setTicket(t.mine1, { updatedAt: day(10) });
    await setTicket(t.mine4, { updatedAt: day(10) });
    // Owned by someone else, and unassigned active ones
    await ticket("otherOwned", "OPEN", { ownerId: other });
    await ticket("unassignedNew", "NEW", { ownerId: null });
    await ticket("unassignedWaiting", "WAITING_FOR_REQUESTER", { ownerId: null });
    await ticket("unassignedResolved", "RESOLVED", { ownerId: null });

    // Urgent Tickets: six active HIGH from the year 2000 (oldest updatedAt first), two tied
    const old = (n: number) => new Date(Date.UTC(2000, 0, 1) + n * DAY_MS);
    for (const [i, s] of (["OPEN", "NEW", "IN_PROGRESS", "REOPENED", "WAITING_FOR_REQUESTER", "OPEN"] as TicketStatus[]).entries()) {
      await ticket(`urgent${i}`, s, { itPriority: "HIGH", updatedAt: old(i === 2 ? 1 : i) });
    }
    // Older still, but excluded: HIGH and not active, or active and not HIGH
    const excluded: [TicketStatus, Priority | null][] = [
      ["RESOLVED", "HIGH"], ["CLOSED", "HIGH"], ["CANCELLED", "HIGH"], ["OPEN", "MEDIUM"], ["NEW", "LOW"], ["IN_PROGRESS", null],
    ];
    for (const [i, [s, p]] of excluded.entries()) {
      await ticket(`excluded${i}`, s, { itPriority: p, updatedAt: new Date(Date.UTC(1999, 0, 1) + i * DAY_MS) });
    }

    // My open Actions: seven assigned to me (two share actionAt); plus finished ones and one assigned to someone else
    const when = (n: number) => new Date(Date.UTC(2026, 9, 20) + n * 3600_000);
    const opens: [ActionStatus, number][] = [["PLANNED", 5], ["IN_PROGRESS", 1], ["PLANNED", 3], ["PLANNED", 3], ["IN_PROGRESS", 7], ["PLANNED", 2], ["PLANNED", 9]];
    for (const [i, [s, h]] of opens.entries()) await action(`open${i}`, t.mine1, me, s, when(h));
    await action("completed", t.mine1, me, "COMPLETED", when(0));
    await action("cancelled", t.mine2, me, "CANCELLED", when(0));
    await action("othersAssigned", t.mine2, other, "PLANNED", when(0)); // I recorded it, but it is assigned to staffB
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  const ids = (list: { id: number }[]) => list.map(x => x.id);

  it("API-31: a Requester calling the staff dashboard, and IT Staff or an Administrator calling the Requester dashboard, get 403", async () => {
    const forbidden = { error: "Forbidden", code: "FORBIDDEN" };
    for (const requester of [fx.users.requesterA, fx.users.requesterB]) {
      const res = await dashApi.staff(requester.cookie);
      expect(res.status).toBe(403);
      expect(res.body).toEqual(forbidden);
    }
    for (const staff of [fx.users.staffA, fx.users.admin]) {
      const res = await dashApi.requester(staff.cookie);
      expect(res.status).toBe(403);
      expect(res.body).toEqual(forbidden);
    }
  });

  it("API-32: all six staff counts equal their SQL counts", async () => {
    const me = fx.users.staffA.id;
    const res = await dashApi.staff(fx.users.staffA.cookie);
    expect(res.status).toBe(200);
    const m = res.body.metrics;
    const active = statusIn(ACTIVE);
    const expected = {
      unassigned: await sqlCount(Prisma.sql`${active} AND "ticketOwnerId" IS NULL`),
      myAssigned: await sqlCount(Prisma.sql`${active} AND "ticketOwnerId" = ${me}`),
      new: await sqlCount(statusIn(["NEW"])),
      inProgress: await sqlCount(statusIn(["IN_PROGRESS"])),
      waitingForRequester: await sqlCount(statusIn(["WAITING_FOR_REQUESTER"])),
      highPriority: await sqlCount(Prisma.sql`${active} AND "itPriority"::text = 'HIGH'`),
    };
    expect(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (v as { count: number }).count]))).toEqual(expected);
    expect(m.myAssigned.count).toBe(4); // NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER owned by me
    expect(m.unassigned.query).toBe("ticketOwnerId=unassigned&currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED");
    expect(m.myAssigned.query).toBe(`ticketOwnerId=${me}&currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED`);
    expect(m.highPriority.query).toBe("itPriority=HIGH&currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED");
    expect([m.new.query, m.inProgress.query, m.waitingForRequester.query])
      .toEqual(["currentStatus=NEW", "currentStatus=IN_PROGRESS", "currentStatus=WAITING_FOR_REQUESTER"]);
    expect(Date.parse(res.body.generatedAt)).not.toBeNaN();
    expect(res.body.generatedAt).toMatch(/Z$/);
  });

  it("API-33: My recent Tickets are mine in any status, newest updatedAt first, ties by id descending, at most 5", async () => {
    const res = await dashApi.staff(fx.users.staffA.cookie);
    const expected = await sqlTicketIds(Prisma.sql`"ticketOwnerId" = ${fx.users.staffA.id}`, Prisma.sql`"updatedAt" DESC, id DESC`);
    expect(ids(res.body.myRecentTickets)).toEqual(expected);
    expect(ids(res.body.myRecentTickets)).toEqual([t.mine4, t.mine1, t.mine6, t.mine5, t.mine3]);
    expect(Object.keys(res.body.myRecentTickets[0]).sort())
      .toEqual(["currentStatus", "id", "itPriority", "summary", "ticketNumber", "updatedAt"]);
  });

  it("API-33: My open Actions are assigned to me, PLANNED or IN_PROGRESS, earliest actionAt first, ties by id ascending, at most 5", async () => {
    const res = await dashApi.staff(fx.users.staffA.cookie);
    const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
      SELECT id FROM "ActionTaken" WHERE "assigneeId" = ${fx.users.staffA.id} AND status::text IN ('PLANNED', 'IN_PROGRESS')
      ORDER BY "actionAt" ASC, id ASC LIMIT 5`);
    expect(ids(res.body.myOpenActions)).toEqual(rows.map(r => r.id));
    expect(ids(res.body.myOpenActions)).toEqual([act.open1, act.open5, act.open2, act.open3, act.open0]);
    const listed = ids(res.body.myOpenActions);
    for (const key of ["completed", "cancelled", "othersAssigned"]) expect(listed).not.toContain(act[key]);
    const ticketNumber = (await prisma.ticket.findUniqueOrThrow({ where: { id: t.mine1 } })).ticketNumber;
    expect(res.body.myOpenActions[0]).toEqual({
      id: act.open1, ticketId: t.mine1, ticketNumber, description: "Dashboard test action open1",
      status: "IN_PROGRESS", actionAt: new Date(Date.UTC(2026, 9, 20) + 3600_000).toISOString(),
    });
  });

  it("API-33: Urgent Tickets are only active Tickets with IT Priority HIGH, least recently updated first, ties by id ascending", async () => {
    const res = await dashApi.staff(fx.users.staffA.cookie);
    const expected = await sqlTicketIds(
      Prisma.sql`${statusIn(ACTIVE)} AND "itPriority"::text = 'HIGH'`, Prisma.sql`"updatedAt" ASC, id ASC`
    );
    expect(ids(res.body.urgentTickets)).toEqual(expected);
    // urgent1 and urgent2 share updatedAt: id ascending
    expect(ids(res.body.urgentTickets)).toEqual([t.urgent0, t.urgent1, t.urgent2, t.urgent3, t.urgent4]);
    for (const row of res.body.urgentTickets) {
      expect(row.itPriority).toBe("HIGH");
      expect(ACTIVE as readonly string[]).toContain(row.currentStatus);
    }
    for (let i = 0; i < 6; i++) expect(ids(res.body.urgentTickets)).not.toContain(t[`excluded${i}`]);
  });

  it("API-34: user counts are present for an Administrator and absent for IT Staff", async () => {
    const admin = await dashApi.staff(fx.users.admin.cookie);
    expect(admin.status).toBe(200);
    const count = async (active: boolean) => Number(
      (await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM "User" WHERE "isActive" = ${active}`))[0].n
    );
    expect(admin.body.users).toEqual({ active: await count(true), inactive: await count(false) });
    expect(admin.body.users.inactive).toBeGreaterThanOrEqual(1); // this file's inactive staff user

    const staff = await dashApi.staff(fx.users.staffA.cookie);
    expect(staff.status).toBe(200);
    expect(staff.body).not.toHaveProperty("users");
  });

  it("API-35: each staff card's query on GET /api/staff/tickets gives totalItems equal to the card number (IT Staff and Administrator)", async () => {
    for (const user of [fx.users.staffA, fx.users.admin]) {
      const dash = await dashApi.staff(user.cookie);
      expect(Object.keys(dash.body.metrics)).toHaveLength(6);
      for (const [name, m] of Object.entries(dash.body.metrics) as [string, { count: number; query: string }][]) {
        const list = await dashApi.queue(user.cookie, `${m.query}&pageSize=1`);
        expect(list.status, name).toBe(200);
        expect(list.body.pagination.totalItems, `${user.email} ${name}`).toBe(m.count);
      }
    }
  });
});
