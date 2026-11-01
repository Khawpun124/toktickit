// The one place the dashboards turn an API timestamp (UTC, ISO-8601) into text. It uses
// Intl.DateTimeFormat with no time zone, so the browser's zone decides how a time reads. The
// result is display only: it is never parsed back, compared, or used to sort or filter (BR-28).

/** Date and time, for example "Oct 12, 2026, 5:20 PM" in the browser's locale and zone. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** Hours and minutes on a 24-hour clock, for "Updated hh:mm". */
export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}
