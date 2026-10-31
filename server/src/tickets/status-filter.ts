import type { Response } from "express";
import type { TicketStatus } from "@prisma/client";
import { sendError } from "../http/errors.js";

// The `currentStatus` list filter of GET /api/tickets and GET /api/staff/tickets (api-spec
// section 7): a comma-separated list, trimmed and de-duplicated, at most 8 values, every value on
// the whitelist. An empty value means "not supplied"; a single value filters exactly as before.

export const TICKET_STATUSES: readonly TicketStatus[] = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
];
const MAX_VALUES = 8;
const ALLOWED_TEXT = TICKET_STATUSES.join(", ");

export type StatusFilter =
  | { ok: true; where?: TicketStatus | { in: TicketStatus[] } }
  | { ok: false };

/**
 * Parses `raw` and, when it is invalid, answers 400 on `res` (ok: false). The message keeps the Lab
 * text that starts with "Invalid currentStatus"; `code` and `fields` are added (section 7).
 */
export function parseStatusFilter(raw: unknown, res: Response): StatusFilter {
  if (raw === undefined || raw === null) return { ok: true };
  const invalid = (): StatusFilter => {
    sendError(res, 400, "VALIDATION_FAILED", `Invalid currentStatus. Allowed values: ${ALLOWED_TEXT}`, {
      fields: { currentStatus: `Use up to ${MAX_VALUES} comma-separated values from: ${ALLOWED_TEXT}` },
    });
    return { ok: false };
  };
  if (typeof raw !== "string") return invalid();
  if (raw.trim() === "") return { ok: true };

  const values = [...new Set(raw.split(",").map(v => v.trim()))];
  if (values.length > MAX_VALUES) return invalid();
  if (!values.every(v => (TICKET_STATUSES as readonly string[]).includes(v))) return invalid();

  const statuses = values as TicketStatus[];
  return { ok: true, where: statuses.length === 1 ? statuses[0] : { in: statuses } };
}
