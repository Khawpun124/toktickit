import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export const API_URL = "http://localhost:3000";

/**
 * The development password the seed gives every user, resolved the way server/src/constants.ts
 * does it: `process.env.INITIAL_MIGRATED_PASSWORD || "<default>"`. That file is an ES module of the
 * server package and cannot be imported here, so the same lookup is repeated: the environment, then
 * server/.env, then the default written in constants.ts. The value is never printed or saved.
 */
function seedPassword(): string {
  const key = "INITIAL_MIGRATED_PASSWORD";
  if (process.env[key]) return process.env[key]!;
  const envFile = path.resolve(__dirname, "../../../server/.env");
  if (fs.existsSync(envFile)) {
    const line = fs.readFileSync(envFile, "utf8").split(/\r?\n/).find(l => l.trim().startsWith(`${key}=`));
    if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  }
  const source = fs.readFileSync(path.resolve(__dirname, "../../../server/src/constants.ts"), "utf8");
  const match = source.match(/MIGRATED_USER_INITIAL_PASSWORD\s*=\s*process\.env\.INITIAL_MIGRATED_PASSWORD\s*\|\|\s*"([^"]+)"/);
  if (!match) throw new Error("[lab-04] could not read the seed password default from server/src/constants.ts");
  return match[1];
}

export const SEED_PASSWORD = seedPassword();

/** Where prepare.ts keeps this run's seed sessions and passwords (git-ignored: /playwright/.auth/). */
export const AUTH_FILE = path.resolve(__dirname, "../../../playwright/.auth/lab4-seed.json");

/** A password that meets the rules (8+, upper and lower case, a digit, a symbol), new for each call. */
export function randomPassword(): string {
  return `E2e-${crypto.randomBytes(9).toString("base64url")}-7a`;
}

export type SeedKey = "admin" | "dashStaff" | "dashStaffIdle" | "dashRequesterMany" | "dashRequesterEmpty";

export const SEED_USERS: Record<SeedKey, string> = {
  admin: "l4-sweep-administrator@tiktockit.com",
  dashStaff: "l4-dash-staff@tiktockit.com",
  dashStaffIdle: "l4-dash-staff-idle@tiktockit.com",
  dashRequesterMany: "l4-dash-requester-many@example.com",
  dashRequesterEmpty: "l4-dash-requester-empty@example.com",
};

export interface Session {
  id: number;
  name: string;
  email: string;
  role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
  /** "name=value" of the session cookie. Kept in memory and in the git-ignored auth file only. */
  cookie: string;
  password: string;
}

export interface PreparedSeed {
  runId: string;
  users: Record<SeedKey, Session>;
}

export function readPreparedSeed(): PreparedSeed {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error(`[lab-04] ${AUTH_FILE} is missing: e2e/global-setup.ts must run e2e/lab-04/support/prepare.ts first.`);
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE, "utf8")) as PreparedSeed;
}
