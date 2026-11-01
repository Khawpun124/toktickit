import type { TicketStatus } from "@prisma/client";

// Dashboard rules that need no database (BR-27, BR-28, BR-29, BR-31). Every function takes the
// instant it works with as a parameter; none reads the clock or the process time zone.

/** BR-27: the active statuses, in the order the drill-down queries list them. */
export const ACTIVE_STATUSES: readonly TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

/** The Requester "Open" card: active statuses except WAITING_FOR_REQUESTER (that is its own card). */
export const REQUESTER_OPEN_STATUSES: readonly TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "REOPENED"];

/** BR-29: every dashboard list holds at most 5 items. */
export const LIST_LIMIT = 5;

/** BR-28: the "Recently resolved" window is exactly 30 x 24 hours. */
export const RECENTLY_RESOLVED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/** BR-28: `generatedAt` minus exactly 2,592,000,000 ms, computed on epoch milliseconds (UTC). */
export function recentlyResolvedSince(generatedAt: Date): Date {
  return new Date(generatedAt.getTime() - RECENTLY_RESOLVED_WINDOW_MS);
}

/** BR-28: `since <= resolvedAt <= generatedAt`, both ends inclusive. */
export function isInRecentlyResolvedWindow(resolvedAt: Date | null, generatedAt: Date): boolean {
  if (!resolvedAt) return false;
  const t = resolvedAt.getTime();
  return t >= recentlyResolvedSince(generatedAt).getTime() && t <= generatedAt.getTime();
}

/** The `currentStatus` part of a drill-down query (comma list, api-spec section 7). */
export function statusQuery(statuses: readonly string[]): string {
  return `currentStatus=${statuses.join(",")}`;
}

/** A card: its number and the exact list query whose `totalItems` equals it (BR-31). */
export function metric(count: number, query: string): { count: number; query: string } {
  return { count, query };
}
