/**
 * Action Taken status rules (BR-11). Pure: no database, no clock.
 */
export const ACTION_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ActionStatusValue = (typeof ACTION_STATUSES)[number];

export const ACTION_TRANSITIONS: Readonly<Record<ActionStatusValue, readonly ActionStatusValue[]>> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// An Action may be created in these statuses, never as CANCELLED.
export const CREATE_STATUSES: readonly ActionStatusValue[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];

export function isActionStatus(value: unknown): value is ActionStatusValue {
  return typeof value === "string" && (ACTION_STATUSES as readonly string[]).includes(value);
}

export function isTerminal(status: ActionStatusValue): boolean {
  return ACTION_TRANSITIONS[status].length === 0;
}

export type TransitionDecision =
  | { kind: "ok" }
  | { kind: "terminal" }                                                   // 409 ACTION_TERMINAL
  | { kind: "invalid"; from: ActionStatusValue; to: ActionStatusValue };   // 400 INVALID_TRANSITION

/**
 * Decides a status change. A terminal Action is reported as terminal whatever the target,
 * because check order puts 409 ACTION_TERMINAL before the stored-state 400. The same status
 * again is an invalid pair.
 */
export function decideTransition(from: ActionStatusValue, to: ActionStatusValue): TransitionDecision {
  if (isTerminal(from)) return { kind: "terminal" };
  if (!ACTION_TRANSITIONS[from].includes(to)) return { kind: "invalid", from, to };
  return { kind: "ok" };
}
