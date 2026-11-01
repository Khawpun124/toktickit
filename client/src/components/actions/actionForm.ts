// Form values, client-side checks, and request bodies for the Action dialog.
// The time window rules for actionAt (BR-05) are left to the server on purpose; the client only
// checks that a readable date and time was entered.
import type {
  ActionTaken, CreateActionPayload, CreateActionStatus, UpdateActionPayload,
} from "../../actionsApi.js";

export const LIMITS = { description: 1000, result: 1000, followUpNote: 500, attachmentNotes: 500 } as const;

export interface ActionFormValues {
  actionAt: string;          // datetime-local value, browser time zone
  description: string;
  status: CreateActionStatus;
  assigneeId: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

export type FieldName = "actionAt" | "description" | "status" | "assigneeId" | "result" | "followUpNote" | "attachmentNotes";

/** Order of the fields in the dialog; the first invalid one receives focus. */
export const FIELD_ORDER: FieldName[] = [
  "actionAt", "description", "status", "assigneeId", "result", "followUpNote", "attachmentNotes",
];

export type FormErrors = Partial<Record<FieldName, string>>;

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date as a datetime-local value in the browser's time zone (minute precision). */
export function toLocalInput(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value back to a Date, or null when it cannot be read. */
export function fromLocalInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function emptyForm(now: Date, currentUserId: number | undefined): ActionFormValues {
  return {
    actionAt: toLocalInput(now),
    description: "",
    status: "PLANNED",
    assigneeId: currentUserId !== undefined ? String(currentUserId) : "",
    result: "",
    followUpRequired: false,
    followUpNote: "",
    attachmentNotes: "",
  };
}

export function formFromAction(a: ActionTaken): ActionFormValues {
  return {
    actionAt: toLocalInput(a.actionAt),
    description: a.description,
    status: a.status === "CANCELLED" ? "PLANNED" : a.status,
    assigneeId: String(a.assignee.id),
    result: a.result ?? "",
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote ?? "",
    attachmentNotes: a.attachmentNotes ?? "",
  };
}

export const MESSAGES = {
  actionAt: "Enter the date and time of the action.",
  description: "Description must be between 5 and 1000 characters.",
  assigneeId: "Choose who the action is assigned to.",
  resultRequiredCreate: "A result is required when the action is created as completed.",
  result: "Result must be between 5 and 1000 characters.",
  followUpNoteRequired: "A follow-up note is required when follow-up is needed.",
  followUpNote: "Follow-up note must be between 5 and 500 characters.",
  attachmentNotes: "Attachment notes must be at most 500 characters.",
  resultRequiredComplete: "A result is required to complete this action.",
  reasonRequired: "A reason is required to cancel this action.",
} as const;

const between = (s: string, min: number, max: number) => s.length >= min && s.length <= max;

export function validateForm(v: ActionFormValues, mode: "create" | "edit"): FormErrors {
  const errors: FormErrors = {};
  if (!fromLocalInput(v.actionAt)) errors.actionAt = MESSAGES.actionAt;
  if (!between(v.description.trim(), 5, LIMITS.description)) errors.description = MESSAGES.description;
  if (!v.assigneeId) errors.assigneeId = MESSAGES.assigneeId;

  const result = v.result.trim();
  if (mode === "create" && v.status === "COMPLETED" && !result) errors.result = MESSAGES.resultRequiredCreate;
  else if (result && !between(result, 5, LIMITS.result)) errors.result = MESSAGES.result;

  if (v.followUpRequired) {
    const note = v.followUpNote.trim();
    if (!note) errors.followUpNote = MESSAGES.followUpNoteRequired;
    else if (!between(note, 5, LIMITS.followUpNote)) errors.followUpNote = MESSAGES.followUpNote;
  }
  if (v.attachmentNotes.trim().length > LIMITS.attachmentNotes) errors.attachmentNotes = MESSAGES.attachmentNotes;
  return errors;
}

/** Result or cancellation reason in the status step panel (required, 5-1000). */
export function validateStepText(text: string, kind: "complete" | "cancel"): string | undefined {
  const t = text.trim();
  if (!t) return kind === "complete" ? MESSAGES.resultRequiredComplete : MESSAGES.reasonRequired;
  if (!between(t, 5, LIMITS.result)) return MESSAGES.result;
  return undefined;
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function toCreatePayload(v: ActionFormValues, clientRequestId: string): CreateActionPayload {
  return {
    actionAt: fromLocalInput(v.actionAt)!.toISOString(),
    description: v.description.trim(),
    status: v.status,
    assigneeId: Number(v.assigneeId),
    result: orNull(v.result),
    followUpRequired: v.followUpRequired,
    followUpNote: v.followUpRequired ? orNull(v.followUpNote) : null,
    attachmentNotes: orNull(v.attachmentNotes),
    clientRequestId,
  };
}

/**
 * The edit body holds only the fields the user changed, plus expectedVersion. An unchanged
 * assignee is not sent, so an Action whose assignee was deactivated can still be edited.
 */
export function toUpdatePayload(initial: ActionFormValues, v: ActionFormValues, version: number): UpdateActionPayload {
  const body: UpdateActionPayload = { expectedVersion: version };
  if (v.actionAt !== initial.actionAt) body.actionAt = fromLocalInput(v.actionAt)!.toISOString();
  if (v.description.trim() !== initial.description.trim()) body.description = v.description.trim();
  if (v.assigneeId !== initial.assigneeId) body.assigneeId = Number(v.assigneeId);
  if (v.result.trim() !== initial.result.trim()) body.result = orNull(v.result);
  if (v.followUpRequired !== initial.followUpRequired) body.followUpRequired = v.followUpRequired;
  if (v.followUpRequired && (v.followUpNote.trim() !== initial.followUpNote.trim() || v.followUpRequired !== initial.followUpRequired)) {
    body.followUpNote = orNull(v.followUpNote);
  }
  if (v.attachmentNotes.trim() !== initial.attachmentNotes.trim()) body.attachmentNotes = orNull(v.attachmentNotes);
  return body;
}

export function isDirty(initial: ActionFormValues, v: ActionFormValues): boolean {
  return (Object.keys(initial) as (keyof ActionFormValues)[]).some(k => initial[k] !== v[k]);
}

export function firstInvalid(errors: FormErrors): FieldName | undefined {
  return FIELD_ORDER.find(f => errors[f]);
}
