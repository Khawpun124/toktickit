import { describe, it, expect } from "vitest";
import {
  TICKET_STATUSES, TICKET_TRANSITIONS, isAllowedTicketTransition, isTerminalTicketStatus, nextTicketStatuses,
} from "../../src/tickets/transitions.js";

/** UNIT-04 (BR-16): the Ticket transition matrix, the Lab 3 matrix unchanged. */
describe("UNIT-04: Ticket transition matrix lookup", () => {
  // BR-16, written out pair by pair as in the specification table.
  const ALLOWED: [string, string][] = [
    ["NEW", "OPEN"], ["NEW", "CANCELLED"],
    ["OPEN", "IN_PROGRESS"], ["OPEN", "CANCELLED"],
    ["IN_PROGRESS", "WAITING_FOR_REQUESTER"], ["IN_PROGRESS", "RESOLVED"], ["IN_PROGRESS", "CANCELLED"],
    ["WAITING_FOR_REQUESTER", "IN_PROGRESS"], ["WAITING_FOR_REQUESTER", "RESOLVED"], ["WAITING_FOR_REQUESTER", "CANCELLED"],
    ["RESOLVED", "CLOSED"], ["RESOLVED", "REOPENED"],
    ["CLOSED", "REOPENED"],
    ["REOPENED", "OPEN"],
  ];
  const allowedKeys = new Set(ALLOWED.map(([f, t]) => `${f}->${t}`));

  it("UNIT-04: has exactly the 14 pairs of BR-16", () => {
    expect(ALLOWED).toHaveLength(14);
    const fromModule = Object.entries(TICKET_TRANSITIONS).flatMap(([f, tos]) => tos.map(t => `${f}->${t}`));
    expect(fromModule.sort()).toEqual([...allowedKeys].sort());
  });

  it.each(ALLOWED)("UNIT-04: %s -> %s is allowed", (from, to) => {
    expect(isAllowedTicketTransition(from, to)).toBe(true);
    expect(nextTicketStatuses(from)).toContain(to);
  });

  it("UNIT-04: every other pair of the 8 statuses (50 pairs, including the same status) is rejected", () => {
    const rejected = TICKET_STATUSES.flatMap(f => TICKET_STATUSES.map(t => [f, t] as const))
      .filter(([f, t]) => !allowedKeys.has(`${f}->${t}`));
    expect(rejected).toHaveLength(64 - 14);
    for (const [from, to] of rejected) expect(isAllowedTicketTransition(from, to), `${from}->${to}`).toBe(false);
  });

  it("UNIT-04: unknown or malformed statuses are rejected", () => {
    for (const to of ["DONE", "open", "", null, undefined, 3, { status: "OPEN" }]) {
      expect(isAllowedTicketTransition("NEW", to), String(to)).toBe(false);
    }
    expect(nextTicketStatuses("UNKNOWN")).toEqual([]);
    expect(isAllowedTicketTransition("UNKNOWN", "OPEN")).toBe(false);
  });

  it("UNIT-04: Cancelled is terminal and is the only terminal status", () => {
    expect(nextTicketStatuses("CANCELLED")).toEqual([]);
    for (const to of TICKET_STATUSES) expect(isAllowedTicketTransition("CANCELLED", to)).toBe(false);
    expect(TICKET_STATUSES.filter(isTerminalTicketStatus)).toEqual(["CANCELLED"]);
  });
});
