#!/usr/bin/env tsx
/**
 * db:rollback:lab4 — Rolls back the Lab 4 migration using prisma/rollback/lab4_down.sql.
 *
 * This script:
 *   1. Refuses to run without --confirm.
 *   2. Resolves the target database from DATABASE_URL (never the container's default database)
 *      and prints it with the number of ActionTaken rows that will be lost.
 *   3. Exports all ActionTaken rows to backups/actions-taken-export-<UTC>.json. The file is
 *      written every time, even with 0 rows. If the export fails for any reason other than
 *      the table not existing (SQLSTATE 42P01), the script stops and drops nothing.
 *   4. Executes lab4_down.sql in a single transaction with psql -v ON_ERROR_STOP=1 and
 *      exits non-zero if psql fails.
 *
 * Usage (from repo root):
 *   npm run db:rollback:lab4 --prefix server -- --confirm
 *
 * After the rollback, verify with:
 *   npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --after-rollback
 */
import fs from "fs";
import path from "path";
import { psql, repoRoot, resolveTarget, serverRoot, type DbTarget } from "./lib/lab4-db.js";

const SCRIPT = "db:rollback:lab4";

function fail(message: string, detail?: string): never {
  console.error(`[${SCRIPT}] ✗ ${message}`);
  if (detail?.trim()) console.error(detail.trim());
  process.exit(1);
}

if (!process.argv.includes("--confirm")) {
  fail(
    "--confirm flag is required.\n" +
    "  This will permanently delete the ActionTaken table and the three Lab 4\n" +
    "  Ticket columns.  Export and backup your data first, then run:\n\n" +
    "    npm run db:backup   --prefix server\n" +
    "    npm run db:snapshot --prefix server\n" +
    "    npm run db:rollback:lab4 --prefix server -- --confirm"
  );
}

const sqlFile = path.join(serverRoot, "prisma", "rollback", "lab4_down.sql");
if (!fs.existsSync(sqlFile)) fail(`SQL file not found: ${sqlFile}`);

let target: DbTarget;
try {
  target = resolveTarget(SCRIPT);
} catch (e) {
  fail((e as Error).message);
}
const db = target.dbName;

// ── Step 1: Count and read ActionTaken in one statement ─────────────────────
// VERBOSITY=verbose makes psql print the SQLSTATE, so only 42P01 (undefined_table)
// is accepted as "already rolled back".
const exportSql =
  `SELECT json_build_object('count', count(*), 'rows', COALESCE(json_agg(a ORDER BY a.id), '[]'::json)) ` +
  `FROM "ActionTaken" a;`;
const exported = psql(db, exportSql, ["-At", "-v", "VERBOSITY=verbose"]);

let tablePresent = true;
let rows: unknown[] = [];
if (exported.status === 0) {
  let parsed: { count: number; rows: unknown[] };
  try {
    parsed = JSON.parse(exported.stdout.trim());
  } catch {
    fail("Could not parse the ActionTaken export returned by psql. Nothing was dropped.");
  }
  if (!Array.isArray(parsed.rows) || parsed.rows.length !== parsed.count) {
    fail("ActionTaken export is incomplete (row count does not match). Nothing was dropped.");
  }
  rows = parsed.rows;
} else if (/ERROR:\s+42P01:/.test(exported.stderr)) {
  tablePresent = false;
  console.log(`[${SCRIPT}] ActionTaken does not exist in ${db} (already rolled back).`);
} else {
  fail(`Exporting ActionTaken failed (psql exit ${exported.status}). Nothing was dropped.`, exported.stderr);
}

console.log(`[${SCRIPT}] ActionTaken rows that will be removed from ${db}: ${rows.length}`);

// ── Step 2: Write the export file (always, even with 0 rows) ────────────────
const backupsDir = path.join(serverRoot, "backups");
fs.mkdirSync(backupsDir, { recursive: true });
const exportedAt = new Date().toISOString();
const exportFile = path.join(backupsDir, `actions-taken-export-${exportedAt.replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(
  exportFile,
  JSON.stringify({ exportedAt, database: db, tablePresent, rowCount: rows.length, rows }, null, 2)
);
console.log(`[${SCRIPT}] ✓ Exported ${rows.length} row(s) to ${exportFile}`);
console.log(`EXPORT_FILE=${exportFile}`);

// ── Step 3: Execute lab4_down.sql ───────────────────────────────────────────
console.log(`\n[${SCRIPT}] Executing ${path.relative(repoRoot, sqlFile)} on ${db} ...`);
const down = psql(db, fs.readFileSync(sqlFile, "utf-8"));
if (down.stdout.trim()) console.log(down.stdout.trimEnd());
if (down.status !== 0) {
  fail(
    `psql exited with code ${down.status}. lab4_down.sql did not commit, so nothing was removed.`,
    down.stderr
  );
}
// NOTICEs such as "table does not exist, skipping" arrive on stderr even on success.
if (down.stderr.trim()) console.log(down.stderr.trimEnd());

console.log(`\n[${SCRIPT}] ✓ Rollback complete on ${db}.`);
console.log("\nNext steps:");
console.log("  1. Verify: npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --after-rollback");
console.log("  2. Run Lab 3 server tests as a smoke check: npm run test --prefix server");
console.log("  3. Re-apply migration when ready: cd server && npx prisma migrate deploy");
