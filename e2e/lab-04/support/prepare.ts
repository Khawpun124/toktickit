import fs from "node:fs";
import path from "node:path";
import { AUTH_FILE, SEED_PASSWORD, SEED_USERS, randomPassword, type PreparedSeed, type SeedKey, type Session } from "./env";
import { call, changePasswordAndSignIn } from "./http";

/**
 * Prepares the Lab 4 seed users once per Playwright run, right after e2e/global-setup.ts has reset
 * the database (so every seed user still needs its first password change). For the administrator
 * that creates the test users and the read-only dashboard users it changes the password through the
 * API to a new random one and keeps the session cookie in playwright/.auth/ (git-ignored).
 * Any failure stops the run with a clear message; nothing is skipped or retried silently.
 */
export async function prepareLab4Seed(): Promise<void> {
  await waitForReady();
  const runId = `${Date.now().toString(36)}`;
  const users = {} as Record<SeedKey, Session>;
  for (const key of Object.keys(SEED_USERS) as SeedKey[]) {
    try {
      users[key] = await changePasswordAndSignIn(SEED_USERS[key], SEED_PASSWORD, randomPassword());
    } catch (err) {
      throw new Error(`[lab-04 prepare] could not prepare ${SEED_USERS[key]}: ${(err as Error).message}`);
    }
  }
  const prepared: PreparedSeed = { runId, users };
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(prepared, null, 2));
  console.log(`[lab-04 prepare] ${Object.keys(users).length} seed users ready (run ${runId}).`);
}

async function waitForReady(): Promise<void> {
  const deadline = Date.now() + 60_000;
  let last = "no answer";
  while (Date.now() < deadline) {
    try {
      const res = await call("GET", "/api/health/ready");
      if (res.status === 200) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = (err as Error).message;
    }
    await new Promise(r => setTimeout(r, 500)); // polling the readiness endpoint, not a fixed wait in a test
  }
  throw new Error(`[lab-04 prepare] /api/health/ready did not answer 200 within 60 s (last: ${last})`);
}
