import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { TicketStatus } from "@prisma/client";
import { createFixture, type Fixture } from "./helpers.js";
import { dashApi, setTicket } from "./dashboard-support.js";

/**
 * API-36: `currentStatus` as a comma list on GET /api/tickets and GET /api/staff/tickets, and every
 * single status on GET /api/tickets (Lab 2 accepted only NEW). The staff list is narrowed with the
 * run id in `search`, so only this file's Tickets count.
 */
const ALL: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];

describe("API-36: currentStatus list filter on the Ticket lists", () => {
  let fx: Fixture;
  const idsByStatus = new Map<TicketStatus, number>();

  beforeAll(async () => {
    fx = await createFixture("statusfilter", "dashtest");
    for (const status of ALL) {
      const id = await fx.createTicket({ requester: "requesterA", status, owner: status === "OPEN" ? "staffA" : null });
      idsByStatus.set(status, id);
    }
    // One HIGH IT Priority Ticket, to check that the list is ANDed with the other filters.
    await setTicket(idsByStatus.get("OPEN")!, { itPriority: "HIGH" });
    await setTicket(idsByStatus.get("NEW")!, { itPriority: "HIGH" });
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  const mine = (q: string) => dashApi.myTickets(fx.users.requesterA.cookie, q);
  const queue = (q: string) => dashApi.queue(fx.users.staffA.cookie, `search=${fx.runId}&${q}`);
  const statuses = (body: { data: { currentStatus: string }[] }) => body.data.map(t => t.currentStatus).sort();

  it("API-36: every single status works on GET /api/tickets, not only NEW", async () => {
    for (const s of ALL) {
      const res = await mine(`currentStatus=${s}`);
      expect(res.status, s).toBe(200);
      expect(res.body.pagination.totalItems, s).toBe(1);
      expect(res.body.data[0].id, s).toBe(idsByStatus.get(s));
    }
  });

  it("API-36: a single NEW behaves as before (only NEW, combined with the other filters)", async () => {
    const res = await mine("currentStatus=NEW");
    expect(statuses(res.body)).toEqual(["NEW"]);
    const both = await mine("currentStatus=NEW&itPriority=HIGH");
    expect(both.body.pagination.totalItems).toBe(1);
    const none = await mine("currentStatus=NEW&itPriority=LOW");
    expect(none.body.pagination.totalItems).toBe(0);
  });

  it("API-36: a comma list is ORed within the list and ANDed with other filters on GET /api/tickets", async () => {
    const res = await mine("currentStatus=NEW,OPEN,IN_PROGRESS,REOPENED");
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(4);
    expect(statuses(res.body)).toEqual(["IN_PROGRESS", "NEW", "OPEN", "REOPENED"]);
    const high = await mine("currentStatus=NEW,OPEN,IN_PROGRESS,REOPENED&itPriority=HIGH");
    expect(statuses(high.body)).toEqual(["NEW", "OPEN"]);
  });

  it("API-36: values are trimmed and de-duplicated; all 8 at once are accepted", async () => {
    const res = await mine(`currentStatus=${encodeURIComponent(" RESOLVED , CLOSED,RESOLVED ")}`);
    expect(res.status).toBe(200);
    expect(statuses(res.body)).toEqual(["CLOSED", "RESOLVED"]);
    const all = await mine(`currentStatus=${ALL.join(",")}`);
    expect(all.body.pagination.totalItems).toBe(8);
  });

  it("API-36: an empty currentStatus is treated as not supplied", async () => {
    const empty = await mine("currentStatus=");
    const none = await mine("");
    expect(empty.status).toBe(200);
    expect(empty.body.pagination.totalItems).toBe(8);
    expect(empty.body.pagination.totalItems).toBe(none.body.pagination.totalItems);
  });

  it("API-36: the same list works on GET /api/staff/tickets, with ticketOwnerId and itPriority", async () => {
    const res = await queue("currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED");
    expect(res.status).toBe(200);
    expect(statuses(res.body)).toEqual(["IN_PROGRESS", "NEW", "OPEN", "REOPENED", "WAITING_FOR_REQUESTER"]);
    const unassigned = await queue("ticketOwnerId=unassigned&currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED");
    expect(statuses(unassigned.body)).toEqual(["IN_PROGRESS", "NEW", "REOPENED", "WAITING_FOR_REQUESTER"]);
    const mineOwned = await queue(`ticketOwnerId=${fx.users.staffA.id}&currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED`);
    expect(statuses(mineOwned.body)).toEqual(["OPEN"]);
    const high = await queue("itPriority=HIGH&currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED");
    expect(statuses(high.body)).toEqual(["NEW", "OPEN"]);
    const single = await queue("currentStatus=CANCELLED");
    expect(statuses(single.body)).toEqual(["CANCELLED"]);
    const empty = await queue("currentStatus=");
    expect(empty.body.pagination.totalItems).toBe(8);
  });

  it("API-36: any invalid value returns 400 VALIDATION_FAILED with fields.currentStatus on both lists", async () => {
    const bad = ["NOT_A_REAL_STATUS", "NEW,BOGUS", "new", "NEW,,OPEN", "OPEN;NEW"];
    for (const value of bad) {
      for (const [name, send] of [["GET /api/tickets", mine], ["GET /api/staff/tickets", queue]] as const) {
        const res = await send(`currentStatus=${encodeURIComponent(value)}`);
        expect(res.status, `${name} ${value}`).toBe(400);
        expect(res.body.error, `${name} ${value}`).toMatch(/^Invalid currentStatus/);
        expect(res.body.code).toBe("VALIDATION_FAILED");
        expect(typeof res.body.fields.currentStatus).toBe("string");
        for (const s of ALL) expect(res.body.fields.currentStatus).toContain(s);
      }
    }
  });
});
