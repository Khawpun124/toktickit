import { CREATE_STATUSES, isActionStatus, type ActionStatusValue } from "./status.js";

/**
 * Action Taken field rules (BR-04 to BR-10, api-spec sections 1, 3-5). Pure: no database,
 * and the current time is always a parameter so tests never depend on the real clock.
 *
 * "Request" checks (check-order step 5) look only at the body. "Stored" checks (step 7)
 * also need the Action as stored and run after the 409 checks.
 */

export type FieldErrors = Record<string, string>;
export type Result<T> = { ok: true; value: T } | { ok: false; fields: FieldErrors; error?: string };

export const LIMITS = {
  description: { min: 5, max: 1000 },
  result: { min: 5, max: 1000 },
  followUpNote: { min: 5, max: 500 },
  attachmentNotesMax: 500,
  inProgressFutureMs: 5 * 60 * 1000,
  plannedFutureMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export const MESSAGES = {
  description: "Description must be between 5 and 1000 characters.",
  result: "Result must be between 5 and 1000 characters.",
  resultRequiredCreate: "A result is required when the action is created as completed.",
  resultRequiredComplete: "A result is required to complete this action.",
  resultRequiredCancel: "A reason is required to cancel this action.",
  followUpNote: "Follow-up note must be between 5 and 500 characters.",
  followUpNoteRequired: "A follow-up note is required when follow-up is needed.",
  followUpNoteWithoutFollowUp: "A follow-up note can only be set when follow-up is required.",
  followUpRequired: "Follow-up required must be true or false.",
  attachmentNotes: "Attachment notes must be at most 500 characters.",
  actionAtInvalid: "Action time must be a valid date and time.",
  actionAtInProgress: "The action time cannot be more than 5 minutes in the future for an action in progress or completed.",
  actionAtPlanned: "A planned action cannot be more than 30 days in the future.",
  createStatus: "Status must be PLANNED, IN_PROGRESS, or COMPLETED.",
  createCancelled: "An action cannot be created as cancelled.",
  status: "Status must be PLANNED, IN_PROGRESS, COMPLETED, or CANCELLED.",
  assigneeId: "The assignee must be an active IT Staff or Administrator.",
  clientRequestId: "clientRequestId must be a UUID.",
  expectedVersion: "expectedVersion is required and must be a positive integer.",
  editStatus: "Status cannot be changed here. Use PATCH /api/staff/actions/:actionId/status.",
  editTicketId: "An action cannot be moved to another ticket. To change the status, use PATCH /api/staff/actions/:actionId/status.",
  noChanges: "No changes supplied",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

// ─── Single-field helpers ────────────────────────────────────────────────────

type TextRule = { min?: number; max: number };

/** Trims a text field. `undefined`, `null`, and blank all mean "empty" (null). */
function readText(value: unknown, rule: TextRule): { value: string | null } | { error: true } {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== "string") return { error: true };
  const trimmed = value.trim();
  if (trimmed === "") return { value: null };
  if (trimmed.length > rule.max || (rule.min !== undefined && trimmed.length < rule.min)) return { error: true };
  return { value: trimmed };
}

function readDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/**
 * BR-05: IN_PROGRESS and COMPLETED may be at most 5 minutes ahead of `now`; PLANNED at most
 * 30 days ahead. Exactly at the limit is allowed. Past times are always allowed.
 * Returns the error message, or null when allowed. CANCELLED has no limit.
 */
export function checkActionAt(actionAt: Date, status: ActionStatusValue, now: Date): string | null {
  const ahead = actionAt.getTime() - now.getTime();
  if ((status === "IN_PROGRESS" || status === "COMPLETED") && ahead > LIMITS.inProgressFutureMs) {
    return MESSAGES.actionAtInProgress;
  }
  if (status === "PLANNED" && ahead > LIMITS.plannedFutureMs) return MESSAGES.actionAtPlanned;
  return null;
}

// ─── Create (POST /api/staff/tickets/:id/actions), step 5 ─────────────────────

export type CreateInput = {
  actionAt: Date;
  description: string;
  status: ActionStatusValue;
  result: string | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  assigneeId: number | null;      // null = default to the current user (resolved by the route)
  clientRequestId: string | null;
};

/**
 * Validates a create body. Ignores `performedBy`, `version`, `createdAt`, and `updatedAt`.
 * Whether the assignee is an active staff member needs the database and is checked by the
 * route; here `assigneeId` only has to be a positive integer when present.
 */
export function validateCreate(body: unknown, now: Date): Result<CreateInput> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fields: FieldErrors = {};

  let status: ActionStatusValue = "PLANNED";
  if (b.status !== undefined) {
    if (b.status === "CANCELLED") fields.status = MESSAGES.createCancelled;
    else if (isActionStatus(b.status) && CREATE_STATUSES.includes(b.status)) status = b.status;
    else fields.status = MESSAGES.createStatus;
  }

  const description = readText(b.description, LIMITS.description);
  if ("error" in description || description.value === null) fields.description = MESSAGES.description;

  const result = readText(b.result, LIMITS.result);
  if ("error" in result) fields.result = MESSAGES.result;
  else if (status === "COMPLETED" && result.value === null) fields.result = MESSAGES.resultRequiredCreate;

  let followUpRequired = false;
  if (b.followUpRequired !== undefined) {
    if (typeof b.followUpRequired === "boolean") followUpRequired = b.followUpRequired;
    else fields.followUpRequired = MESSAGES.followUpRequired;
  }

  // BR-09: when follow-up is not required the note is discarded, whatever was sent.
  let followUpNote: string | null = null;
  if (followUpRequired) {
    const note = readText(b.followUpNote, LIMITS.followUpNote);
    if ("error" in note) fields.followUpNote = MESSAGES.followUpNote;
    else if (note.value === null) fields.followUpNote = MESSAGES.followUpNoteRequired;
    else followUpNote = note.value;
  }

  const attachmentNotes = readText(b.attachmentNotes, { max: LIMITS.attachmentNotesMax });
  if ("error" in attachmentNotes) fields.attachmentNotes = MESSAGES.attachmentNotes;

  let actionAt = now;
  if (b.actionAt !== undefined && b.actionAt !== null) {
    const parsed = readDate(b.actionAt);
    if (!parsed) fields.actionAt = MESSAGES.actionAtInvalid;
    else actionAt = parsed;
  }
  if (!fields.actionAt && !fields.status) {
    const tooFar = checkActionAt(actionAt, status, now);
    if (tooFar) fields.actionAt = tooFar;
  }

  let assigneeId: number | null = null;
  if (b.assigneeId !== undefined && b.assigneeId !== null) {
    if (isPositiveInt(b.assigneeId)) assigneeId = b.assigneeId;
    else fields.assigneeId = MESSAGES.assigneeId;
  }

  let clientRequestId: string | null = null;
  if (b.clientRequestId !== undefined && b.clientRequestId !== null) {
    if (isUuid(b.clientRequestId)) clientRequestId = b.clientRequestId.toLowerCase();
    else fields.clientRequestId = MESSAGES.clientRequestId;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      actionAt,
      description: (description as { value: string }).value,
      status,
      result: (result as { value: string | null }).value,
      followUpRequired,
      followUpNote,
      attachmentNotes: (attachmentNotes as { value: string | null }).value,
      assigneeId,
      clientRequestId,
    },
  };
}

// ─── Edit (PATCH /api/staff/actions/:actionId) ───────────────────────────────

export type EditPatch = Partial<{
  description: string;
  result: string | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  actionAt: Date;
  assigneeId: number;
}>;

export type EditRequest = { expectedVersion: number; patch: EditPatch };

const EDITABLE = ["description", "result", "followUpRequired", "followUpNote", "attachmentNotes", "actionAt", "assigneeId"] as const;

/** Step 5: body shape only. `version`, `performedBy`, `createdAt`, `updatedAt` are ignored. */
export function validateEditRequest(body: unknown): Result<EditRequest> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fields: FieldErrors = {};
  const patch: EditPatch = {};

  if (!isPositiveInt(b.expectedVersion)) fields.expectedVersion = MESSAGES.expectedVersion;
  if ("status" in b) fields.status = MESSAGES.editStatus;
  if ("ticketId" in b) fields.ticketId = MESSAGES.editTicketId;

  if ("description" in b) {
    const d = readText(b.description, LIMITS.description);
    if ("error" in d || d.value === null) fields.description = MESSAGES.description;
    else patch.description = d.value;
  }
  if ("result" in b) {
    const r = readText(b.result, LIMITS.result);
    if ("error" in r) fields.result = MESSAGES.result;
    else patch.result = r.value;
  }
  if ("followUpRequired" in b) {
    if (typeof b.followUpRequired === "boolean") patch.followUpRequired = b.followUpRequired;
    else fields.followUpRequired = MESSAGES.followUpRequired;
  }
  if ("followUpNote" in b) {
    const n = readText(b.followUpNote, LIMITS.followUpNote);
    if ("error" in n) fields.followUpNote = MESSAGES.followUpNote;
    else patch.followUpNote = n.value;
  }
  if ("attachmentNotes" in b) {
    const a = readText(b.attachmentNotes, { max: LIMITS.attachmentNotesMax });
    if ("error" in a) fields.attachmentNotes = MESSAGES.attachmentNotes;
    else patch.attachmentNotes = a.value;
  }
  if ("actionAt" in b) {
    const d = readDate(b.actionAt);
    if (!d) fields.actionAt = MESSAGES.actionAtInvalid;
    else patch.actionAt = d;
  }
  if ("assigneeId" in b) {
    if (isPositiveInt(b.assigneeId)) patch.assigneeId = b.assigneeId;
    else fields.assigneeId = MESSAGES.assigneeId;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  if (!EDITABLE.some(k => k in b)) return { ok: false, fields: {}, error: MESSAGES.noChanges };
  return { ok: true, value: { expectedVersion: b.expectedVersion as number, patch } };
}

export type StoredAction = {
  status: ActionStatusValue;
  description: string;
  result: string | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  actionAt: Date;
  assigneeId: number;
};

export type EditChanges = Partial<Omit<StoredAction, "status">>;

/**
 * Step 7: applies the patch to the stored Action and returns only the values that change.
 * - followUpRequired false (sent, or stored and not sent as true) clears followUpNote; a note
 *   sent while the stored flag is false and the body does not set it true is a 400.
 * - The final state must have a note when follow-up is required.
 * - actionAt is checked against the stored status.
 * - Nothing different from the stored values gives "No changes supplied".
 */
export function planEdit(stored: StoredAction, patch: EditPatch, now: Date): Result<EditChanges> {
  const fields: FieldErrors = {};
  const followUpRequired = patch.followUpRequired ?? stored.followUpRequired;

  let followUpNote: string | null;
  if (!followUpRequired) {
    if (patch.followUpRequired === undefined && patch.followUpNote !== undefined && patch.followUpNote !== null) {
      fields.followUpNote = MESSAGES.followUpNoteWithoutFollowUp;
    }
    followUpNote = null;
  } else {
    followUpNote = patch.followUpNote !== undefined ? patch.followUpNote : stored.followUpNote;
    if (followUpNote === null) fields.followUpNote = MESSAGES.followUpNoteRequired;
  }

  const next = {
    description: patch.description ?? stored.description,
    result: patch.result !== undefined ? patch.result : stored.result,
    followUpRequired,
    followUpNote,
    attachmentNotes: patch.attachmentNotes !== undefined ? patch.attachmentNotes : stored.attachmentNotes,
    actionAt: patch.actionAt ?? stored.actionAt,
    assigneeId: patch.assigneeId ?? stored.assigneeId,
  };

  if (patch.actionAt) {
    const tooFar = checkActionAt(patch.actionAt, stored.status, now);
    if (tooFar) fields.actionAt = tooFar;
  }
  if (Object.keys(fields).length > 0) return { ok: false, fields };

  const changes: EditChanges = {};
  if (next.description !== stored.description) changes.description = next.description;
  if (next.result !== stored.result) changes.result = next.result;
  if (next.followUpRequired !== stored.followUpRequired) changes.followUpRequired = next.followUpRequired;
  if (next.followUpNote !== stored.followUpNote) changes.followUpNote = next.followUpNote;
  if (next.attachmentNotes !== stored.attachmentNotes) changes.attachmentNotes = next.attachmentNotes;
  if (next.actionAt.getTime() !== stored.actionAt.getTime()) changes.actionAt = next.actionAt;
  if (next.assigneeId !== stored.assigneeId) changes.assigneeId = next.assigneeId;

  if (Object.keys(changes).length === 0) return { ok: false, fields: {}, error: MESSAGES.noChanges };
  return { ok: true, value: changes };
}

// ─── Status change (PATCH /api/staff/actions/:actionId/status) ───────────────

export type StatusRequest = { expectedVersion: number; status: ActionStatusValue; result: string | null };

/** Step 5: body shape only. Other fields in the body are ignored. */
export function validateStatusRequest(body: unknown): Result<StatusRequest> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fields: FieldErrors = {};
  if (!isPositiveInt(b.expectedVersion)) fields.expectedVersion = MESSAGES.expectedVersion;
  if (!isActionStatus(b.status)) fields.status = MESSAGES.status;
  const r = readText(b.result, LIMITS.result);
  if ("error" in r) fields.result = MESSAGES.result;
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: { expectedVersion: b.expectedVersion as number, status: b.status as ActionStatusValue, result: (r as { value: string | null }).value },
  };
}

/**
 * Step 7, after the transition itself was found allowed: a Result must exist (sent or stored)
 * for COMPLETED and CANCELLED, and the stored actionAt is re-checked for IN_PROGRESS and
 * COMPLETED. Returns the Result to store.
 */
export function planStatusChange(
  stored: Pick<StoredAction, "result" | "actionAt">,
  to: ActionStatusValue,
  sentResult: string | null,
  now: Date
): Result<{ result: string | null }> {
  const fields: FieldErrors = {};
  const result = sentResult ?? stored.result;
  if (to === "COMPLETED" && result === null) fields.result = MESSAGES.resultRequiredComplete;
  if (to === "CANCELLED" && result === null) fields.result = MESSAGES.resultRequiredCancel;
  if (to === "IN_PROGRESS" || to === "COMPLETED") {
    const tooFar = checkActionAt(stored.actionAt, to, now);
    if (tooFar) fields.actionAt = tooFar;
  }
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value: { result } };
}
