import { describe, it, expect } from "vitest";
import {
  TICKET_TRANSITIONS, confirmationMessage, needsConfirmation, nextTicketStatuses,
} from "../../src/ticketWorkflow.js";

// UNIT-06 (BR-16, AC-18): the client function deciding whether a From-To pair needs confirmation.
describe("UNIT-06: status-change confirmation rule", () => {
  // The "Confirmation in UI" column of BR-16, pair by pair.
  const MATRIX: [string, string, boolean][] = [
    ["NEW", "OPEN", false], ["NEW", "CANCELLED", true],
    ["OPEN", "IN_PROGRESS", false], ["OPEN", "CANCELLED", true],
    ["IN_PROGRESS", "WAITING_FOR_REQUESTER", false], ["IN_PROGRESS", "RESOLVED", true], ["IN_PROGRESS", "CANCELLED", true],
    ["WAITING_FOR_REQUESTER", "IN_PROGRESS", false], ["WAITING_FOR_REQUESTER", "RESOLVED", true], ["WAITING_FOR_REQUESTER", "CANCELLED", true],
    ["RESOLVED", "CLOSED", false], ["RESOLVED", "REOPENED", false],
    ["CLOSED", "REOPENED", true],
    ["REOPENED", "OPEN", false],
  ];

  it.each(MATRIX)("UNIT-06: %s -> %s needs confirmation: %s", (from, to, expected) => {
    expect(needsConfirmation(from, to)).toBe(expected);
  });

  it("UNIT-06: the table above is the whole client matrix (14 pairs), so no permitted pair is left out", () => {
    const pairs = Object.entries(TICKET_TRANSITIONS).flatMap(([f, tos]) => tos.map(t => `${f}->${t}`)).sort();
    expect(pairs).toEqual(MATRIX.map(([f, t]) => `${f}->${t}`).sort());
    expect(nextTicketStatuses("CANCELLED")).toEqual([]);
  });

  it("UNIT-06: Open to Cancelled yes, Resolved to Closed no; pairs outside the matrix never ask", () => {
    expect(needsConfirmation("OPEN", "CANCELLED")).toBe(true);
    expect(needsConfirmation("RESOLVED", "CLOSED")).toBe(false);
    expect(needsConfirmation("NEW", "RESOLVED")).toBe(false);
    expect(needsConfirmation("CANCELLED", "OPEN")).toBe(false);
  });

  it("UNIT-06: the question names both statuses, and Cancelled adds the count of unfinished actions", () => {
    expect(confirmationMessage("CLOSED", "REOPENED", 0)).toBe("Change status from Closed to Reopened?");
    expect(confirmationMessage("WAITING_FOR_REQUESTER", "RESOLVED", 0)).toBe("Change status from Waiting for Requester to Resolved?");
    expect(confirmationMessage("OPEN", "CANCELLED", 3)).toBe(
      "Change status from Open to Cancelled?\n\n3 unfinished action(s) will be cancelled automatically."
    );
  });
});
