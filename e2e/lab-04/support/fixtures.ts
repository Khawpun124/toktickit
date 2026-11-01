import { test as base, expect, type BrowserContext } from "@playwright/test";
import { randomPassword, readPreparedSeed, type PreparedSeed, type Session } from "./env";
import { changePasswordAndSignIn, expectOk } from "./http";

// Fixtures for the Lab 4 specs. Every test makes its own users (unique per spec, project, test,
// and repeat) and its own Tickets through the API, using the prepared seed administrator. The seed
// dashboard users are only ever read. The browser gets a session by cookie instead of the login
// screen, except in the steps that test the login itself.

export type Role = Session["role"];

export interface Lab4Fixtures {
  seed: PreparedSeed;
  /** Creates a user through the Administrator API, does its first password change, and signs it in. */
  makeUser: (role: Role, label: string) => Promise<Session>;
  /** Puts a user's session into a browser context. */
  useSession: (context: BrowserContext, user: Session) => Promise<void>;
}

let counter = 0;

export const test = base.extend<Lab4Fixtures, { seedWorker: PreparedSeed }>({
  seedWorker: [async ({}, use) => { await use(readPreparedSeed()); }, { scope: "worker" }],
  seed: async ({ seedWorker }, use) => { await use(seedWorker); },

  makeUser: async ({ seed }, use, testInfo) => {
    const slug = testInfo.titlePath.slice(-1)[0].replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24).toLowerCase();
    await use(async (role, label) => {
      counter += 1;
      const email = `e2e4-${slug}-${testInfo.project.name}-r${testInfo.repeatEachIndex}-${seed.runId}-${counter}@example.com`;
      const initial = randomPassword();
      await expectOk("POST", "/api/admin/users", {
        cookie: seed.users.admin.cookie,
        body: { name: label, email, role, isActive: true, initialPassword: initial },
      }, [201]);
      return changePasswordAndSignIn(email, initial, randomPassword());
    });
  },

  useSession: async ({}, use) => {
    await use(async (context, user) => {
      const [name, ...rest] = user.cookie.split("=");
      await context.addCookies([{ name, value: rest.join("="), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
    });
  },
});

export { expect };

// ─── API shortcuts (the test's own data) ────────────────────────────────────

let refCache: { categoryId: number; relatedSystemId: number } | null = null;

async function references() {
  if (!refCache) {
    const categories = await expectOk<{ id: number }[]>("GET", "/api/categories");
    const systems = await expectOk<{ id: number }[]>("GET", "/api/related-systems");
    refCache = { categoryId: categories.body[0].id, relatedSystemId: systems.body[0].id };
  }
  return refCache;
}

/** A Ticket raised by `requester`. It never gets IT Priority HIGH (keeps the Urgent Tickets list of E2E-05 to the seed). */
export async function createTicket(requester: Session, summary: string): Promise<{ id: number; ticketNumber: string }> {
  const refs = await references();
  const res = await expectOk("POST", "/api/tickets", {
    cookie: requester.cookie,
    body: { ...refs, summary, description: `${summary}. Created by a Lab 4 end-to-end test.`, requestedPriority: "MEDIUM" },
  }, [201]);
  return { id: res.body.id, ticketNumber: res.body.ticketNumber };
}

/** Moves a Ticket through the given statuses, one permitted step at a time. */
export async function moveTicket(staff: Session, ticketId: number, statuses: string[]): Promise<void> {
  for (const newStatus of statuses) {
    await expectOk("PATCH", `/api/staff/tickets/${ticketId}/status`, { cookie: staff.cookie, body: { newStatus } }, [200]);
  }
}

export async function setOwner(staff: Session, ticketId: number, ownerId: number): Promise<void> {
  await expectOk("PATCH", `/api/staff/tickets/${ticketId}/owner`, { cookie: staff.cookie, body: { ticketOwnerId: ownerId } }, [200]);
}

export async function createAction(
  staff: Session, ticketId: number, body: { description: string; status?: "PLANNED" | "IN_PROGRESS"; assigneeId?: number }
): Promise<{ id: number; version: number }> {
  const res = await expectOk("POST", `/api/staff/tickets/${ticketId}/actions`, { cookie: staff.cookie, body }, [201]);
  return { id: res.body.id, version: res.body.version };
}
