import { describe, it, expect } from "vitest";
import {
  ACTION_STATUSES, CREATE_STATUSES, decideTransition, isTerminal, type ActionStatusValue,
} from "../../src/actions/status.js";

// UNIT-01 (BR-11, AC-08): Action status matrix.
describe("UNIT-01: Action status transition matrix", () => {
  const allowed: Array<[ActionStatusValue, ActionStatusValue]> = [
    ["PLANNED", "IN_PROGRESS"],
    ["PLANNED", "COMPLETED"],
    ["PLANNED", "CANCELLED"],
    ["IN_PROGRESS", "COMPLETED"],
    ["IN_PROGRESS", "CANCELLED"],
  ];
  const isAllowed = (from: ActionStatusValue, to: ActionStatusValue) =>
    allowed.some(([f, t]) => f === from && t === to);

  it.each(allowed)("allows %s -> %s", (from, to) => {
    expect(decideTransition(from, to)).toEqual({ kind: "ok" });
  });

  const nonTerminal: ActionStatusValue[] = ["PLANNED", "IN_PROGRESS"];
  const rejected = nonTerminal.flatMap(from =>
    ACTION_STATUSES.filter(to => !isAllowed(from, to)).map(to => [from, to] as [ActionStatusValue, ActionStatusValue])
  );

  it("rejects exactly the other pairs from non-terminal states, including the same status again", () => {
    expect(rejected).toEqual([
      ["PLANNED", "PLANNED"],
      ["IN_PROGRESS", "PLANNED"],
      ["IN_PROGRESS", "IN_PROGRESS"],
    ]);
  });

  it.each(rejected)("rejects %s -> %s as an invalid transition naming both statuses", (from, to) => {
    expect(decideTransition(from, to)).toEqual({ kind: "invalid", from, to });
  });

  it.each(["COMPLETED", "CANCELLED"] as ActionStatusValue[])("%s is terminal: every target gives terminal", from => {
    expect(isTerminal(from)).toBe(true);
    for (const to of ACTION_STATUSES) expect(decideTransition(from, to)).toEqual({ kind: "terminal" });
  });

  it("PLANNED and IN_PROGRESS are not terminal", () => {
    expect(isTerminal("PLANNED")).toBe(false);
    expect(isTerminal("IN_PROGRESS")).toBe(false);
  });

  it("an Action can be created as PLANNED, IN_PROGRESS, or COMPLETED, never CANCELLED", () => {
    expect([...CREATE_STATUSES]).toEqual(["PLANNED", "IN_PROGRESS", "COMPLETED"]);
  });
});
