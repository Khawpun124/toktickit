#!/usr/bin/env tsx
/**
 * test-upgrade-path-lab4.ts — Automated proof of the full Lab 4 upgrade procedure.
 *
 * Covers: MIG-01 (data preserved), MIG-02 (backfill values), MIG-03 (rollback with
 *         Actions exported first, and the backup restore), MIG-07 (failure in the
 *         middle of the migration), MIG-08 (verify at-upgrade and after-rollback).
 *
 * Safety:
 * - Works only on the separate database "toktickit_upgrade_test", which it creates and
 *   drops. Before changing anything it checks that this name differs from the database
 *   in DATABASE_URL (loaded from server/.env) and aborts otherwise.
 * - Every child process gets DATABASE_URL pointing at the test database and
 *   LAB4_EXPECT_DB=toktickit_upgrade_test, so a Lab 4 script that resolves any other
 *   database refuses to run, and every Prisma command must report the test database.
 * - The Lab 4 migration folder is hidden while Lab 1-3 are deployed, and for MIG-07 its
 *   migration.sql temporarily holds a broken copy. Cleanup restores both on every exit
 *   path (including Ctrl+C) from a .good_backup kept in os.tmpdir(), then checks that
 *   `git status` of prisma/migrations is unchanged. It never touches .env.
 *
 * Usage (from server/):  npx tsx scripts/test-upgrade-path-lab4.ts
 */
import { spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { runUserMigration } from "../src/utils/migrate-users.js";
import { loadServerEnv, parseDatabaseUrl, psql, repoRoot, serverRoot, type DbTarget } from "./lib/lab4-db.js";

const TEST_DB = "toktickit_upgrade_test";
const LAB4_MIGRATION_SUFFIX = "_add_actions_taken_and_workflow_fields";
const migrationsDir = path.join(serverRoot, "prisma", "migrations");
const hideDir = path.join(serverRoot, "prisma", ".lab4_upgrade_temp");
const PRISMA_CLI = path.join(serverRoot, "node_modules", "prisma", "build", "index.js");
const TSX_CLI = path.join(serverRoot, "node_modules", "tsx", "dist", "cli.mjs");

// The broken copy for MIG-07 is inserted right after this statement (end of step 2,
// before the Ticket indexes and the backfill).
const FAILURE_ANCHOR = 'ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "statusChangedAt" TIMESTAMP(3);';
const FAILURE_SQL =
  "\n\n-- MIG-07 forced failure (test copy only): steps 1 and 2 above must roll back with it.\n" +
  'ALTER TABLE "__lab4_forced_failure__" ADD COLUMN "x" TEXT;\n';

// ─── Guards: run before anything is changed ──────────────────────────────────

function abort(message: string): never {
  console.error(`\n❌ ABORTED before any change: ${message}`);
  process.exit(1);
}

function migrationsGitStatus(): string {
  const r = spawnSync("git", ["status", "--porcelain", "--", "prisma/migrations"], { cwd: serverRoot, encoding: "utf-8" });
  if (r.error || r.status !== 0) throw new Error(`git status failed: ${r.error?.message ?? r.stderr}`);
  return r.stdout;
}

loadServerEnv();
let devTarget: DbTarget;
let testTarget: DbTarget;
try {
  devTarget = parseDatabaseUrl(process.env.DATABASE_URL);
  const testUrl = new URL(devTarget.url.href);
  testUrl.pathname = `/${TEST_DB}`;
  testTarget = parseDatabaseUrl(testUrl.href, "test database URL");
} catch (e) {
  abort((e as Error).message);
}
if (testTarget.url.pathname !== `/${TEST_DB}` || testTarget.dbName !== TEST_DB) {
  abort(`the test database URL does not end in /${TEST_DB}`);
}
if (devTarget.dbName === TEST_DB) {
  abort(`DATABASE_URL already names ${TEST_DB}; it must name the dev database, which this script never touches`);
}

const gitBefore = migrationsGitStatus();
if (gitBefore !== "") {
  abort(`prisma/migrations has uncommitted changes; commit or stash them first so the cleanup can prove nothing changed:\n${gitBefore}`);
}
if (fs.existsSync(hideDir)) {
  abort(`${hideDir} exists from an earlier run; move its contents back into prisma/migrations by hand first`);
}
if (!fs.existsSync(PRISMA_CLI) || !fs.existsSync(TSX_CLI)) abort("run npm install in server/ first");

const testEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: testTarget.url.href, LAB4_EXPECT_DB: TEST_DB };
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "toktickit-lab4-upgrade-"));

// ─── State restored by cleanup() ─────────────────────────────────────────────

const state = {
  hiddenFolder: null as string | null,   // Lab 4 folder currently moved to hideDir
  brokenSqlPath: null as string | null,  // real migration.sql currently holding the broken copy
  goodBackupPath: path.join(workDir, "migration.sql.good_backup"),
  goodSha256: "",
  testDbCreated: false,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function indent(text: string): string {
  return text.replace(/^/gm, "    ");
}

type ChildResult = { status: number | null; stdout: string; stderr: string };

// Runs a CLI through node (no shell) in server/ against the test database and echoes its output.
function runChild(label: string, entry: string, args: string[], allowFailure = false): ChildResult {
  console.log(`  $ ${label} ${args.join(" ")}   (DATABASE_URL → ${TEST_DB})`);
  const r = spawnSync(process.execPath, [entry, ...args], {
    cwd: serverRoot, env: testEnv, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.stdout) process.stdout.write(indent(r.stdout));
  if (r.stderr) process.stderr.write(indent(r.stderr));
  if (r.status !== 0 && !allowFailure) throw new Error(`${label} ${args.join(" ")} exited with code ${r.status}`);
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// Prisma prints the database it connected to; anything but the test database stops the run.
function prismaCli(args: string[], allowFailure = false): ChildResult {
  const r = runChild("prisma", PRISMA_CLI, args, allowFailure);
  const named = (r.stdout + r.stderr).match(/PostgreSQL database "([^"]+)"/);
  if (named && named[1] !== TEST_DB) throw new Error(`prisma connected to "${named[1]}", expected ${TEST_DB}`);
  if (!named && args[1] === "deploy") throw new Error("prisma migrate deploy did not report its database");
  return r;
}

function tsxScript(script: string, args: string[] = [], allowFailure = false): ChildResult {
  return runChild(`tsx scripts/${script}`, TSX_CLI, [path.join("scripts", script), ...args], allowFailure);
}

// Maintenance statements run on the "postgres" database. TEST_DB is a constant that the
// guards above proved differs from the dev database.
function psqlMaintenance(sql: string): void {
  const r = psql("postgres", sql);
  if (r.status !== 0) throw new Error(`psql on postgres failed: ${r.stderr.trim()}`);
}

function psqlTestDb(input: string | { file: string }): void {
  const r = psql(TEST_DB, input);
  if (r.status !== 0) throw new Error(`psql on ${TEST_DB} failed: ${r.stderr.trim()}`);
}

function pgDumpTestDb(outFile: string): void {
  const fd = fs.openSync(outFile, "w");
  let r;
  try {
    r = spawnSync(
      "docker",
      ["compose", "exec", "-T", "postgres", "sh", "-c", 'exec pg_dump -U "$POSTGRES_USER" -d "$1"', "pg_dump", TEST_DB],
      { cwd: repoRoot, stdio: ["ignore", fd, "pipe"], encoding: "utf-8" }
    );
  } finally {
    fs.closeSync(fd);
  }
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`pg_dump of ${TEST_DB} failed: ${r.stderr.trim()}`);
  if (fs.statSync(outFile).size === 0) throw new Error(`pg_dump of ${TEST_DB} produced an empty file`);
}

function findLab4Folder(): string | null {
  const found = fs.readdirSync(migrationsDir).find(
    n => fs.statSync(path.join(migrationsDir, n)).isDirectory() && n.endsWith(LAB4_MIGRATION_SUFFIX)
  );
  return found ?? null;
}

function hideLab4Migration(): string {
  const folder = findLab4Folder();
  if (!folder) throw new Error("Lab 4 migration folder not found in prisma/migrations");
  fs.mkdirSync(hideDir, { recursive: true });
  fs.renameSync(path.join(migrationsDir, folder), path.join(hideDir, folder));
  state.hiddenFolder = folder;
  return folder;
}

function unhideLab4Migration(): void {
  if (!state.hiddenFolder) return;
  fs.renameSync(path.join(hideDir, state.hiddenFolder), path.join(migrationsDir, state.hiddenFolder));
  state.hiddenFolder = null;
  fs.rmdirSync(hideDir);
}

function restoreGoodSql(): void {
  if (!state.brokenSqlPath) return;
  fs.copyFileSync(state.goodBackupPath, state.brokenSqlPath);
  if (sha256(state.brokenSqlPath) !== state.goodSha256) {
    throw new Error(`restored ${state.brokenSqlPath} does not match the original sha256`);
  }
  state.brokenSqlPath = null;
}

function verify(args: string[], label: string): void {
  console.log(`\n  [verify] ${label}`);
  tsxScript("lab4-verify.ts", args);
}

function snapshot(): string {
  const out = tsxScript("lab4-snapshot.ts").stdout;
  const match = out.match(/SNAPSHOT_FILE=(.+)/);
  if (!match) throw new Error("Could not parse the snapshot file path from db:snapshot output");
  return match[1].trim();
}

type ExportFile = { database: string; rowCount: number; rows: Array<{ id: number; description: string }> };

// Runs db:rollback:lab4 on the test database and checks the export it wrote first.
function rollback(expectedActionIds: number[]): void {
  const out = tsxScript("lab4-rollback.ts", ["--confirm"]).stdout;
  const match = out.match(/EXPORT_FILE=(.+)/);
  if (!match) throw new Error("db:rollback:lab4 did not report an export file");
  const exported = JSON.parse(fs.readFileSync(match[1].trim(), "utf-8")) as ExportFile;
  const ids = exported.rows.map(r => r.id);
  const ok = exported.database === TEST_DB && exported.rowCount === expectedActionIds.length &&
    JSON.stringify(ids) === JSON.stringify(expectedActionIds);
  console.log(`  export: database=${exported.database}, rows=${exported.rowCount}, ids=[${ids.join(", ")}] ` +
    `(expected [${expectedActionIds.join(", ")}]) ${ok ? "✓" : "✗"}`);
  if (!ok) throw new Error("ActionTaken export does not contain the expected rows");
}

// ─── Cleanup: runs on success, failure, and Ctrl+C ───────────────────────────

let cleanedUp = false;
function cleanup(): boolean {
  if (cleanedUp) return true;
  cleanedUp = true;
  let ok = true;
  console.log("\n[Cleanup]");

  // 1. Put the real migration.sql back before any folder is moved.
  if (state.brokenSqlPath) {
    try {
      restoreGoodSql();
      console.log("  ✓ migration.sql restored from .good_backup (sha256 matches)");
    } catch (e) {
      ok = false;
      console.error(`  ✗ ${(e as Error).message}; the good copy is kept at ${state.goodBackupPath}`);
    }
  }

  // 2. Move the hidden Lab 4 folder back. Nothing else is ever moved into prisma/migrations.
  if (state.hiddenFolder) {
    const src = path.join(hideDir, state.hiddenFolder);
    const dest = path.join(migrationsDir, state.hiddenFolder);
    if (fs.existsSync(dest)) {
      ok = false;
      console.error(`  ✗ ${dest} already exists; ${src} left in place for manual review`);
    } else {
      fs.renameSync(src, dest);
      state.hiddenFolder = null;
      console.log(`  ✓ Restored ${path.basename(dest)} to prisma/migrations`);
    }
  }
  if (fs.existsSync(hideDir)) {
    const left = fs.readdirSync(hideDir);
    if (left.length === 0) fs.rmdirSync(hideDir);
    else {
      ok = false;
      console.error(`  ✗ ${hideDir} still contains: ${left.join(", ")} (not moved automatically)`);
    }
  }

  // 3. Drop the test database.
  if (state.testDbCreated) {
    try {
      psqlMaintenance(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
      console.log(`  ✓ ${TEST_DB} dropped`);
    } catch (e) {
      ok = false;
      console.error(`  ✗ Could not drop ${TEST_DB}: ${(e as Error).message}`);
    }
  }

  // 4. Remove the work files (good backup, broken copy, test dump) unless a restore failed.
  if (ok) fs.rmSync(workDir, { recursive: true, force: true });
  else console.error(`  ✗ Work files kept for inspection: ${workDir}`);

  // 5. Prove the repository's migrations are exactly as before.
  const gitAfter = migrationsGitStatus();
  console.log(`  git status --porcelain -- prisma/migrations: ${gitAfter === "" ? "(no changes)" : "\n" + gitAfter}`);
  if (gitAfter !== gitBefore) {
    ok = false;
    console.error("  ✗ prisma/migrations changed during the run");
  } else {
    console.log("  ✓ prisma/migrations unchanged");
  }
  return ok;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.error(`\nReceived ${signal}`);
    cleanup();
    process.exit(130);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function runTest() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Lab 4 Upgrade Path Verification (test-upgrade-path-lab4.ts) ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`  Dev database (never touched): ${devTarget.dbName}`);
  console.log(`  Test database:                ${TEST_DB} (${testTarget.url.host})\n`);

  // ── Phase 0: fresh test DB ─────────────────────────────────────────────────
  console.log("[Phase 0] Creating the test database ...");
  state.testDbCreated = true; // set first so cleanup also drops a half-created database
  psqlMaintenance(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psqlMaintenance(`CREATE DATABASE ${TEST_DB};`);
  console.log(`  ✓ ${TEST_DB} created\n`);

  // ── Phase 1: Apply Lab 1-3 migrations only ────────────────────────────────
  console.log("[Phase 1] Hiding the Lab 4 migration, deploying Lab 1-3 migrations ...");
  const lab4Folder = hideLab4Migration();
  console.log(`  Hidden: ${lab4Folder}`);
  prismaCli(["migrate", "deploy"]);
  console.log("  ✓ Migrations 1-9 applied\n");

  // ── Phase 2: Insert simulated Lab 3 data ──────────────────────────────────
  console.log("[Phase 2] Inserting simulated Lab 3 data ...");
  const prisma = new PrismaClient({ datasources: { db: { url: testTarget.url.href } } });
  let staffId: number;
  let commentTicketId: number;
  try {
    const [cat] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "Category" (name, "isActive", "createdAt") VALUES ('Test HW', true, NOW()) RETURNING id`
    );
    const [sys] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "RelatedSystem" (name) VALUES ('Test System') RETURNING id`
    );

    // RequesterUsers (Lab 2 era)
    const [req1] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "RequesterUser" (name, email, "isActive", "createdAt") VALUES ('Alice Up', 'alice.up@example.com', true, NOW()) RETURNING id`
    );
    const [req2] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "RequesterUser" (name, email, "isActive", "createdAt") VALUES ('Bob Up', 'bob.up@example.com', true, NOW()) RETURNING id`
    );

    // One Ticket per status, inserted for RequesterUser ids before runUserMigration moves them
    const tktStatuses: Array<[string, string]> = [
      ["TKT-UP-001", "NEW"],
      ["TKT-UP-002", "OPEN"],
      ["TKT-UP-003", "IN_PROGRESS"],
      ["TKT-UP-004", "WAITING_FOR_REQUESTER"],
      ["TKT-UP-005", "RESOLVED"],
      ["TKT-UP-006", "CLOSED"],
      ["TKT-UP-007", "REOPENED"],
      ["TKT-UP-008", "CANCELLED"],
    ];
    for (const [tkt, status] of tktStatuses) {
      const rid = tkt <= "TKT-UP-005" ? req1.id : req2.id;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Ticket" ("ticketNumber", "requesterId", "categoryId", "relatedSystemId",
         summary, description, "requestedPriority", "currentStatus", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'Test description', 'HIGH'::"Priority", $6::"TicketStatus", NOW(), NOW())`,
        tkt, rid, cat.id, sys.id, `Ticket ${tkt} ${status}`, status
      );
    }

    // runUserMigration: copies RequesterUsers → Users, updates requesterId, adds the FK
    const migResult = await runUserMigration(prisma);
    console.log(`  ✓ runUserMigration: ${migResult.migratedUsersCount} users, ${migResult.updatedTicketsCount} tickets`);

    const [staff] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "User" (name, email, "passwordHash", role, "isActive", "mustChangePassword", "createdAt", "updatedAt")
       VALUES ('Staff Up', 'staff.up@tiktockit.com', 'hash', 'IT_STAFF', true, false, NOW(), NOW()) RETURNING id`
    );
    staffId = staff.id;

    await prisma.$executeRawUnsafe(
      `UPDATE "Ticket" SET "ticketOwnerId" = $1 WHERE "ticketNumber" = 'TKT-UP-002'`, staffId
    );

    const [ticket] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `SELECT id FROM "Ticket" WHERE "ticketNumber" = 'TKT-UP-003'`
    );
    const [alice] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `SELECT id FROM "User" WHERE email = 'alice.up@example.com'`
    );
    commentTicketId = ticket.id;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PublicComment" ("ticketId", "authorId", content, "createdAt") VALUES ($1, $2, 'Test comment', NOW())`,
      commentTicketId, alice.id
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "InternalNote" ("ticketId", "authorId", content, "createdAt") VALUES ($1, $2, 'Test note', NOW())`,
      commentTicketId, staffId
    );

    const [{ tickets, comments }] = await prisma.$queryRawUnsafe<[{ tickets: number; comments: number }]>(
      `SELECT (SELECT count(*) FROM "Ticket")::int AS tickets, (SELECT count(*) FROM "PublicComment")::int AS comments`
    );
    console.log(`  ✓ ${tickets} tickets, ${comments} comments inserted\n`);
  } finally {
    await prisma.$disconnect();
  }

  // ── Phase 3: Snapshot and backup of the Lab 3 state ───────────────────────
  console.log("[Phase 3] Taking the snapshot and a backup of the Lab 3 state ...");
  const snapshotFile = snapshot();
  const dumpFile = path.join(workDir, "lab3-before-lab4-test.sql");
  pgDumpTestDb(dumpFile);
  console.log(`  ✓ snapshot → ${snapshotFile}`);
  console.log(`  ✓ backup   → ${dumpFile} (${(fs.statSync(dumpFile).size / 1024).toFixed(1)} KB)\n`);

  // ── Phase 4: Apply the Lab 4 migration ────────────────────────────────────
  console.log("[Phase 4] Restoring the Lab 4 migration and deploying ...");
  unhideLab4Migration();
  prismaCli(["migrate", "deploy"]);
  console.log("  ✓ Migration 10 applied\n");

  // ── Phase 5: Verify at-upgrade (MIG-01, MIG-08) ───────────────────────────
  console.log("[Phase 5] Verifying at-upgrade ...");
  verify(["--snapshot", snapshotFile, "--at-upgrade"], "MIG-01 + MIG-08 (at-upgrade)");
  console.log();

  // ── Phase 6: Backfill values per Ticket (MIG-02) ──────────────────────────
  console.log("[Phase 6] Backfill values per Ticket (MIG-02) ...");
  await checkBackfill();

  // ── Phase 7: Write one Action so the rollback has something to export ────
  console.log("[Phase 7] Inserting one ActionTaken row ...");
  const actionId = await insertAction(staffId, commentTicketId);
  console.log(`  ✓ ActionTaken id ${actionId} inserted\n`);

  // ── Phase 8: Rollback (MIG-03) ────────────────────────────────────────────
  console.log("[Phase 8] Rolling back with db:rollback:lab4 --confirm (MIG-03) ...");
  rollback([actionId]);
  console.log("  ✓ Rollback done, Action exported first\n");

  // ── Phase 9: Verify after rollback (MIG-03, MIG-08) ───────────────────────
  console.log("[Phase 9] Verifying after rollback ...");
  verify(["--snapshot", snapshotFile, "--after-rollback"], "MIG-03 + MIG-08 (after-rollback)");
  console.log();

  // ── Phase 10: Re-apply and verify ─────────────────────────────────────────
  console.log("[Phase 10] Re-applying the Lab 4 migration ...");
  prismaCli(["migrate", "deploy"]);
  verify(["--snapshot", snapshotFile, "--at-upgrade"], "MIG-08 second deploy");
  console.log();

  // ── Phase 11: Failure in the middle of the migration (MIG-07) ─────────────
  console.log("[Phase 11] Failure in the middle of a copy of the migration (MIG-07) ...");
  rollback([]); // nothing to export; the export file is still written
  const realFolder = findLab4Folder();
  if (!realFolder) throw new Error("Lab 4 migration folder not found in prisma/migrations");
  const realSqlPath = path.join(migrationsDir, realFolder, "migration.sql");

  const goodSql = fs.readFileSync(realSqlPath, "utf-8");
  if (goodSql.split(FAILURE_ANCHOR).length !== 2) {
    throw new Error("The failure anchor must appear exactly once in migration.sql");
  }
  state.goodSha256 = sha256(realSqlPath);
  fs.copyFileSync(realSqlPath, state.goodBackupPath);
  const brokenCopy = path.join(workDir, "migration.broken.sql");
  fs.writeFileSync(brokenCopy, goodSql.replace(FAILURE_ANCHOR, FAILURE_ANCHOR + FAILURE_SQL));
  state.brokenSqlPath = realSqlPath; // set before the copy so cleanup restores even a partial write
  fs.copyFileSync(brokenCopy, realSqlPath);
  console.log(`  Broken copy (kept in ${workDir}) placed after step 2, before the backfill`);

  const failed = prismaCli(["migrate", "deploy"], true);
  if (failed.status === 0) throw new Error("Expected the broken migration to fail, but it succeeded");
  if (!(failed.stdout + failed.stderr).includes("__lab4_forced_failure__")) {
    throw new Error("The deploy failed, but not at the forced failure statement (see output above)");
  }
  console.log("  ✓ Deploy failed at the forced statement (output above)");

  verify(["--expect-absent"], "MIG-07: no partial schema after the failure");

  console.log(`\n  Resolving the failed migration: ${realFolder}`);
  prismaCli(["migrate", "resolve", "--rolled-back", realFolder]);

  restoreGoodSql();
  console.log("  ✓ migration.sql restored from .good_backup (sha256 matches)");

  prismaCli(["migrate", "deploy"]);
  verify(["--snapshot", snapshotFile, "--at-upgrade"], "MIG-07: verify after recovery");
  console.log();

  // ── Phase 12: Restore the backup, Option B (MIG-03) ───────────────────────
  console.log("[Phase 12] Restoring the Phase 3 backup (Rollback option B, MIG-03) ...");
  psqlTestDb("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  psqlTestDb({ file: dumpFile });
  console.log("  ✓ Backup restored");
  verify(["--snapshot", snapshotFile, "--after-rollback"], "MIG-03: data equals the snapshot after the restore");
  prismaCli(["migrate", "deploy"]);
  verify(["--snapshot", snapshotFile, "--at-upgrade"], "MIG-03: migration re-applies after the restore");
}

async function checkBackfill(): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: testTarget.url.href } } });
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      ticketNumber: string; currentStatus: string; version: number;
      resolved_null: boolean; resolved_eq: boolean; sca_null: boolean; sca_eq: boolean;
    }>>(
      `SELECT "ticketNumber", "currentStatus"::text AS "currentStatus", "version",
              "resolvedAt" IS NULL AS resolved_null,
              "resolvedAt" IS NOT DISTINCT FROM "updatedAt" AS resolved_eq,
              "statusChangedAt" IS NULL AS sca_null,
              "statusChangedAt" IS NOT DISTINCT FROM "updatedAt" AS sca_eq
       FROM "Ticket" ORDER BY id`
    );
    const [{ actions }] = await prisma.$queryRawUnsafe<[{ actions: number }]>(
      `SELECT count(*)::int AS actions FROM "ActionTaken"`
    );

    let failures = 0;
    console.log("  ticket       status                 version  resolvedAt          statusChangedAt   ok");
    for (const r of rows) {
      const resolvedExpected = r.currentStatus === "RESOLVED" || r.currentStatus === "CLOSED";
      const resolvedOk = resolvedExpected ? r.resolved_eq : r.resolved_null;
      const ok = r.version === 1 && resolvedOk && !r.sca_null && r.sca_eq;
      if (!ok) failures++;
      const resolvedText = r.resolved_null ? "NULL" : r.resolved_eq ? "= updatedAt" : "≠ updatedAt";
      const scaText = r.sca_null ? "NULL" : r.sca_eq ? "= updatedAt" : "≠ updatedAt";
      console.log(`  ${r.ticketNumber.padEnd(12)} ${r.currentStatus.padEnd(22)} ${String(r.version).padEnd(8)} ` +
        `${resolvedText.padEnd(19)} ${scaText.padEnd(17)} ${ok ? "✓" : "✗"}`);
    }
    console.log(`  ActionTaken rows: ${actions} ${actions === 0 ? "✓" : "✗"}`);
    if (actions !== 0) failures++;
    if (rows.length === 0) failures++;
    if (failures > 0) throw new Error(`MIG-02 backfill check failed (${failures} problem(s))`);
    console.log("  ✓ MIG-02 backfill values correct\n");
  } finally {
    await prisma.$disconnect();
  }
}

async function insertAction(performedById: number, ticketId: number): Promise<number> {
  const prisma = new PrismaClient({ datasources: { db: { url: testTarget.url.href } } });
  try {
    const [row] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "ActionTaken" ("ticketId", "actionAt", "description", "result",
         "performedById", "assigneeId", "status", "updatedAt")
       VALUES ($1, NOW(), 'Upgrade test action', 'Exported before rollback', $2, $2, 'COMPLETED'::"ActionStatus", NOW())
       RETURNING id`,
      ticketId, performedById
    );
    return row.id;
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  let passed = false;
  try {
    await runTest();
    passed = true;
  } catch (e) {
    console.error("\n❌ UPGRADE PATH TEST FAILED:", e instanceof Error ? e.message : e);
  }
  const cleanedOk = cleanup();
  if (passed && cleanedOk) {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  ✓  Upgrade Path Verification SUCCESSFUL (all phases)        ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
  }
  process.exit(passed && cleanedOk ? 0 : 1);
})();
