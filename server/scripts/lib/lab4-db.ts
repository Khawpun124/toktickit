/**
 * Shared database targeting for the Lab 4 scripts.
 *
 * Every Lab 4 script acts on the database named in DATABASE_URL, never on the
 * container's default database, and prints that name before it changes anything.
 * The one exception is db:backup, which dumps the container's default database (A7)
 * and refuses to run unless it is the same database DATABASE_URL names.
 * No function here prints or throws the URL itself, because it carries the password.
 */
import { spawnSync, type SpawnSyncReturns } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseEnv } from "util";

export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const repoRoot = path.resolve(serverRoot, "..");

/**
 * Loads server/.env into process.env without overriding variables that are already set,
 * so a child started by test-upgrade-path-lab4 keeps the test DATABASE_URL it was given.
 */
export function loadServerEnv(): void {
  const envFile = path.join(serverRoot, ".env");
  if (!fs.existsSync(envFile)) return;
  const parsed = parseEnv(fs.readFileSync(envFile, "utf-8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

export type DbTarget = { url: URL; dbName: string };

const DB_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

/** Parses a Postgres URL and extracts the database name. Malformed input always throws. */
export function parseDatabaseUrl(raw: string | undefined, label = "DATABASE_URL"): DbTarget {
  if (!raw) throw new Error(`${label} is not set`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${label} must start with postgresql:// or postgres://`);
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!DB_NAME_PATTERN.test(dbName)) {
    throw new Error(`${label} must name one database (letters, digits, and underscores only)`);
  }
  return { url, dbName };
}

/**
 * Resolves the database a Lab 4 script will act on and prints it. When LAB4_EXPECT_DB is
 * set (test-upgrade-path-lab4 sets it for every child), any other database is refused.
 */
export function resolveTarget(scriptName: string): DbTarget {
  loadServerEnv();
  const target = parseDatabaseUrl(process.env.DATABASE_URL);
  const expected = process.env.LAB4_EXPECT_DB;
  if (expected && expected !== target.dbName) {
    throw new Error(
      `DATABASE_URL names "${target.dbName}" but LAB4_EXPECT_DB is "${expected}"; refusing to run`
    );
  }
  console.log(`[${scriptName}] Target database: ${target.dbName} (${target.url.host})`);
  return target;
}

// Runs inside the container as $POSTGRES_USER. The database name and every psql flag are
// passed as separate arguments ("$@"), so no shell on either side parses them.
const PSQL_SH = 'db="$1"; shift; exec psql -v ON_ERROR_STOP=1 -X -U "$POSTGRES_USER" -d "$db" "$@"';

/**
 * Runs SQL with psql inside the Postgres container. `input` is SQL text or { file } to stream
 * a file to stdin. ON_ERROR_STOP makes psql stop at the first error and exit non-zero.
 */
export function psql(
  dbName: string,
  input: string | { file: string },
  extraArgs: string[] = []
): SpawnSyncReturns<string> {
  if (!DB_NAME_PATTERN.test(dbName)) throw new Error(`Invalid database name: ${dbName}`);
  const args = ["compose", "exec", "-T", "postgres", "sh", "-c", PSQL_SH, "psql", dbName, ...extraArgs];
  let result: SpawnSyncReturns<string>;
  if (typeof input === "string") {
    result = spawnSync("docker", args, {
      cwd: repoRoot, input, encoding: "utf-8", maxBuffer: 512 * 1024 * 1024,
    });
  } else {
    const fd = fs.openSync(input.file, "r");
    try {
      result = spawnSync("docker", args, {
        cwd: repoRoot, stdio: [fd, "pipe", "pipe"], encoding: "utf-8", maxBuffer: 512 * 1024 * 1024,
      });
    } finally {
      fs.closeSync(fd);
    }
  }
  if (result.error) throw new Error(`Failed to start docker: ${result.error.message}`);
  return result;
}
