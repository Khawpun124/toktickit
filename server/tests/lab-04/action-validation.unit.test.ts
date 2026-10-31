import { describe, it, expect } from "vitest";
import {
  LIMITS, MESSAGES, checkActionAt, planEdit, planStatusChange,
  validateCreate, validateEditRequest, validateStatusRequest, type StoredAction,
} from "../../src/actions/validation.js";

const NOW = new Date("2026-10-12T09:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const s = (n: number) => "x".repeat(n);

const validCreate = { description: "Replaced the battery" };

function createFields(body: Record<string, unknown>) {
  const r = validateCreate(body, NOW);
  return r.ok ? {} : r.fields;
}

// UNIT-02 (BR-07 to BR-10, AC-05, AC-09): field validation.
describe("UNIT-02: Action field validation", () => {
  describe("description (5-1000 after trimming)", () => {
    it("accepts 5 and 1000 characters and trims surrounding spaces", () => {
      expect(createFields({ description: s(5) })).toEqual({});
      expect(createFields({ description: s(1000) })).toEqual({});
      const r = validateCreate({ description: `   ${s(5)}   ` }, NOW);
      expect(r.ok && r.value.description).toBe(s(5));
    });
    it("rejects 4 and 1001 characters, blanks, and a 4-character value padded with spaces", () => {
      for (const d of [s(4), s(1001), "", "     ", `  ${s(4)}  `, undefined, 42]) {
        expect(createFields({ description: d }).description, String(d)).toBe(MESSAGES.description);
      }
    });
  });

  describe("result (5-1000; required to create as COMPLETED)", () => {
    it("accepts 5 and 1000 characters", () => {
      expect(createFields({ ...validCreate, result: s(5) })).toEqual({});
      expect(createFields({ ...validCreate, result: s(1000) })).toEqual({});
    });
    it("rejects 4 and 1001 characters", () => {
      expect(createFields({ ...validCreate, result: s(4) }).result).toBe(MESSAGES.result);
      expect(createFields({ ...validCreate, result: s(1001) }).result).toBe(MESSAGES.result);
    });
    it("is optional for PLANNED and IN_PROGRESS and stored as null when blank", () => {
      for (const status of ["PLANNED", "IN_PROGRESS"]) {
        const r = validateCreate({ ...validCreate, status, result: "   " }, NOW);
        expect(r.ok && r.value.result, status).toBeNull();
      }
    });
    it("is required to create as COMPLETED", () => {
      expect(createFields({ ...validCreate, status: "COMPLETED" }).result).toBe(MESSAGES.resultRequiredCreate);
      expect(createFields({ ...validCreate, status: "COMPLETED", result: "  " }).result).toBe(MESSAGES.resultRequiredCreate);
      expect(createFields({ ...validCreate, status: "COMPLETED", result: s(5) })).toEqual({});
    });
  });

  describe("followUpRequired and followUpNote (BR-09: note 5-500 when required)", () => {
    it("defaults followUpRequired to false with no note", () => {
      const r = validateCreate(validCreate, NOW);
      expect(r.ok && [r.value.followUpRequired, r.value.followUpNote]).toEqual([false, null]);
    });
    it("requires a note when follow-up is required", () => {
      expect(createFields({ ...validCreate, followUpRequired: true }).followUpNote).toBe(MESSAGES.followUpNoteRequired);
      expect(createFields({ ...validCreate, followUpRequired: true, followUpNote: "   " }).followUpNote).toBe(MESSAGES.followUpNoteRequired);
    });
    it("accepts a note of 5 and 500 characters and rejects 4 and 501", () => {
      expect(createFields({ ...validCreate, followUpRequired: true, followUpNote: s(5) })).toEqual({});
      expect(createFields({ ...validCreate, followUpRequired: true, followUpNote: s(500) })).toEqual({});
      expect(createFields({ ...validCreate, followUpRequired: true, followUpNote: s(4) }).followUpNote).toBe(MESSAGES.followUpNote);
      expect(createFields({ ...validCreate, followUpRequired: true, followUpNote: s(501) }).followUpNote).toBe(MESSAGES.followUpNote);
    });
    it("discards a note sent with followUpRequired false", () => {
      const r = validateCreate({ ...validCreate, followUpRequired: false, followUpNote: "Call back next week" }, NOW);
      expect(r.ok && r.value.followUpNote).toBeNull();
    });
    it("rejects a non-boolean followUpRequired", () => {
      expect(createFields({ ...validCreate, followUpRequired: "yes" }).followUpRequired).toBe(MESSAGES.followUpRequired);
    });
  });

  describe("attachmentNotes (up to 500)", () => {
    it("accepts 500 characters, stores blank as null, rejects 501", () => {
      expect(createFields({ ...validCreate, attachmentNotes: s(500) })).toEqual({});
      const r = validateCreate({ ...validCreate, attachmentNotes: "  " }, NOW);
      expect(r.ok && r.value.attachmentNotes).toBeNull();
      expect(createFields({ ...validCreate, attachmentNotes: s(501) }).attachmentNotes).toBe(MESSAGES.attachmentNotes);
    });
  });

  describe("status at creation, assignee, clientRequestId, ignored fields", () => {
    it("defaults to PLANNED and rejects CANCELLED and unknown values", () => {
      const r = validateCreate(validCreate, NOW);
      expect(r.ok && r.value.status).toBe("PLANNED");
      expect(createFields({ ...validCreate, status: "CANCELLED" }).status).toBe(MESSAGES.createCancelled);
      expect(createFields({ ...validCreate, status: "DONE" }).status).toBe(MESSAGES.createStatus);
    });
    it("requires assigneeId to be a positive integer when present and leaves the default to the route", () => {
      const r = validateCreate(validCreate, NOW);
      expect(r.ok && r.value.assigneeId).toBeNull();
      for (const id of [0, -1, 1.5, "7"]) expect(createFields({ ...validCreate, assigneeId: id }).assigneeId).toBe(MESSAGES.assigneeId);
    });
    it("accepts a UUID clientRequestId (stored lower-case) and rejects other strings", () => {
      const r = validateCreate({ ...validCreate, clientRequestId: "0B0C4A2E-6F1D-4C1C-9A53-6D2F3F6F6F21" }, NOW);
      expect(r.ok && r.value.clientRequestId).toBe("0b0c4a2e-6f1d-4c1c-9a53-6d2f3f6f6f21");
      expect(createFields({ ...validCreate, clientRequestId: "abc" }).clientRequestId).toBe(MESSAGES.clientRequestId);
    });
    it("ignores performedBy, version, createdAt, and updatedAt", () => {
      const r = validateCreate({ ...validCreate, performedBy: 99, version: 7, createdAt: "x", updatedAt: "y" }, NOW);
      expect(r.ok).toBe(true);
      expect(r.ok && Object.keys(r.value).sort()).toEqual([
        "actionAt", "assigneeId", "attachmentNotes", "clientRequestId", "description",
        "followUpNote", "followUpRequired", "result", "status",
      ]);
    });
  });

  describe("edit request (step 5)", () => {
    it("requires expectedVersion as a positive integer", () => {
      for (const v of [undefined, 0, "1", 1.5]) {
        const r = validateEditRequest({ expectedVersion: v, description: s(5) });
        expect(!r.ok && r.fields.expectedVersion, String(v)).toBe(MESSAGES.expectedVersion);
      }
    });
    it("rejects status and ticketId with messages pointing to the status endpoint", () => {
      const r = validateEditRequest({ expectedVersion: 1, status: "COMPLETED", ticketId: 5 });
      expect(!r.ok && r.fields).toEqual({ status: MESSAGES.editStatus, ticketId: MESSAGES.editTicketId });
      expect(MESSAGES.editStatus).toContain("/status");
      expect(MESSAGES.editTicketId).toContain("/status");
    });
    it("gives 'No changes supplied' when no editable field is present", () => {
      const r = validateEditRequest({ expectedVersion: 1, version: 3 });
      expect(r).toEqual({ ok: false, fields: {}, error: MESSAGES.noChanges });
    });
  });

  describe("edit against the stored Action (step 7)", () => {
    const stored: StoredAction = {
      status: "IN_PROGRESS", description: "Original description", result: null,
      followUpRequired: true, followUpNote: "Check again next week", attachmentNotes: null,
      actionAt: new Date(NOW.getTime() - DAY), assigneeId: 7,
    };

    it("turning followUpRequired off clears the stored note", () => {
      const r = planEdit(stored, { followUpRequired: false }, NOW);
      expect(r).toEqual({ ok: true, value: { followUpRequired: false, followUpNote: null } });
    });
    it("followUpRequired false in the same body discards a sent note", () => {
      const r = planEdit(stored, { followUpRequired: false, followUpNote: "Another note here" }, NOW);
      expect(r.ok && r.value.followUpNote).toBeNull();
    });
    it("a note alone while the stored followUpRequired is false is rejected", () => {
      const r = planEdit({ ...stored, followUpRequired: false, followUpNote: null }, { followUpNote: "A new note here" }, NOW);
      expect(!r.ok && r.fields.followUpNote).toBe(MESSAGES.followUpNoteWithoutFollowUp);
    });
    it("turning followUpRequired on without any note is rejected", () => {
      const r = planEdit({ ...stored, followUpRequired: false, followUpNote: null }, { followUpRequired: true }, NOW);
      expect(!r.ok && r.fields.followUpNote).toBe(MESSAGES.followUpNoteRequired);
    });
    it("values equal to the stored ones give 'No changes supplied'", () => {
      const r = planEdit(stored, { description: stored.description, assigneeId: 7, actionAt: new Date(stored.actionAt) }, NOW);
      expect(r).toEqual({ ok: false, fields: {}, error: MESSAGES.noChanges });
    });
    it("returns only the fields that change", () => {
      const r = planEdit(stored, { description: "New description", assigneeId: 7 }, NOW);
      expect(r).toEqual({ ok: true, value: { description: "New description" } });
    });
    it("checks a new actionAt against the stored status", () => {
      const r = planEdit(stored, { actionAt: new Date(NOW.getTime() + 5 * MIN + 1) }, NOW);
      expect(!r.ok && r.fields.actionAt).toBe(MESSAGES.actionAtInProgress);
    });
  });

  describe("status request and stored-state checks", () => {
    it("requires expectedVersion and one of the four statuses", () => {
      const r = validateStatusRequest({ status: "DONE" });
      expect(!r.ok && r.fields).toEqual({ expectedVersion: MESSAGES.expectedVersion, status: MESSAGES.status });
    });
    it("rejects a sent result of 4 or 1001 characters", () => {
      for (const n of [4, 1001]) {
        const r = validateStatusRequest({ expectedVersion: 1, status: "COMPLETED", result: s(n) });
        expect(!r.ok && r.fields.result).toBe(MESSAGES.result);
      }
    });
    const past = { result: null, actionAt: new Date(NOW.getTime() - MIN) };
    it("requires a result, sent or stored, to complete or cancel", () => {
      expect(planStatusChange(past, "COMPLETED", null, NOW)).toEqual({ ok: false, fields: { result: MESSAGES.resultRequiredComplete } });
      expect(planStatusChange(past, "CANCELLED", null, NOW)).toEqual({ ok: false, fields: { result: MESSAGES.resultRequiredCancel } });
      expect(planStatusChange({ ...past, result: "Stored result" }, "COMPLETED", null, NOW)).toEqual({ ok: true, value: { result: "Stored result" } });
      expect(planStatusChange(past, "CANCELLED", "No longer needed", NOW)).toEqual({ ok: true, value: { result: "No longer needed" } });
    });
    it("does not require a result to start", () => {
      expect(planStatusChange(past, "IN_PROGRESS", null, NOW)).toEqual({ ok: true, value: { result: null } });
    });
  });
});

// UNIT-03 (BR-05): actionAt window.
describe("UNIT-03: actionAt window", () => {
  it("IN_PROGRESS and COMPLETED: exactly now + 5 minutes is allowed, 1 ms more is not", () => {
    for (const status of ["IN_PROGRESS", "COMPLETED"] as const) {
      expect(checkActionAt(new Date(at(LIMITS.inProgressFutureMs)), status, NOW), status).toBeNull();
      expect(checkActionAt(new Date(at(LIMITS.inProgressFutureMs + 1)), status, NOW), status).toBe(MESSAGES.actionAtInProgress);
    }
  });
  it("PLANNED: exactly now + 30 days is allowed, 1 ms more is not", () => {
    expect(checkActionAt(new Date(at(30 * DAY)), "PLANNED", NOW)).toBeNull();
    expect(checkActionAt(new Date(at(30 * DAY + 1)), "PLANNED", NOW)).toBe(MESSAGES.actionAtPlanned);
  });
  it("any past time is allowed for every status", () => {
    for (const status of ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const) {
      expect(checkActionAt(new Date(at(-365 * DAY)), status, NOW)).toBeNull();
    }
  });
  it("create: a PLANNED action 10 days ahead is accepted, a COMPLETED one is rejected", () => {
    expect(createFields({ ...validCreate, actionAt: at(10 * DAY) })).toEqual({});
    expect(createFields({ ...validCreate, status: "COMPLETED", result: s(5), actionAt: at(10 * DAY) }).actionAt)
      .toBe(MESSAGES.actionAtInProgress);
  });
  it("create: defaults actionAt to now and rejects an unparseable value", () => {
    const r = validateCreate(validCreate, NOW);
    expect(r.ok && r.value.actionAt.toISOString()).toBe(NOW.toISOString());
    expect(createFields({ ...validCreate, actionAt: "yesterday-ish" }).actionAt).toBe(MESSAGES.actionAtInvalid);
  });
  it("status change re-checks the stored actionAt when moving to IN_PROGRESS or COMPLETED", () => {
    const planned = { result: "Done and tested", actionAt: new Date(at(2 * DAY)) };
    expect(planStatusChange(planned, "IN_PROGRESS", null, NOW)).toEqual({ ok: false, fields: { actionAt: MESSAGES.actionAtInProgress } });
    expect(planStatusChange(planned, "COMPLETED", null, NOW)).toEqual({ ok: false, fields: { actionAt: MESSAGES.actionAtInProgress } });
    expect(planStatusChange(planned, "CANCELLED", null, NOW)).toEqual({ ok: true, value: { result: "Done and tested" } });
  });
});
