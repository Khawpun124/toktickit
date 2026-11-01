// The instant a dashboard request captures as `generatedAt` (BR-28). It is the real time unless a
// test replaces it in-process with setDashboardClock. Nothing reachable over HTTP can change it.

type Clock = () => Date;

const realClock: Clock = () => new Date();
let clock: Clock = realClock;

export function dashboardNow(): Date {
  return new Date(clock().getTime());
}

/** Test hook: pass a function to fix the time, or null to go back to the real clock. */
export function setDashboardClock(next: Clock | null): void {
  clock = next ?? realClock;
}
