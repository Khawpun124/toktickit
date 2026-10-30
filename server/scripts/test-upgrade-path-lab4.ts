#!/usr/bin/env tsx
/**
 * test-upgrade-path-lab4.ts — Automated proof of the full Lab 4 upgrade procedure.
 *
 * Covers: MIG-01 (data preserved), MIG-03 (rollback), MIG-07 (failure simulation),
 *         MIG-08 (verify at-upgrade and after-rollback).
 *
 * Uses a SEPARATE database "toktickit_upgrade_test" that this script creates
 * and drops by itself.  It NEVER touches the dev database and NEVER modifies .env.
 * DATABASE_URL for child processes is passed via environment, not written to disk.
 *
 * Usage (from server/):  npx tsx scripts/test-upgrade-path-lab4.ts
 */
import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { runUserMigration } from "../src/utils/migrate-users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");
const migrationsDir = path.join(serverRoot, "prisma", "migrations");
const tempDir = path.join(serverRoot, "prisma", ".lab4_upgrade_temp");

const LAB4_MIGRATION_SUFFIX = "_add_actions_taken_and_workflow_fields";
const TEST_DB = "toktickit_upgrade_test";
const BACKUPS_DIR = path.join(serverRoot, "backups");

// ─── Build test DATABASE_URL ─────────────────────────────────────────────────

const baseUrl = process.env.DATABASE_URL!;
if (!baseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
// Replace only the database name portion of the URL
const testDbUrl = baseUrl.replace(/(postgresql:\/\/[^/]+\/)([^?]+)/, `$1${TEST_DB}`);
const testEnv = { ...process.env, DATABASE_URL: testDbUrl };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPrismaForTest(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: testDbUrl } } });
}

function findLab4Folder(): string | null {
  if (!fs.existsSync(migrationsDir)) return null;
  const found = fs.readdirSync(migrationsDir).find(
    n => fs.statSync(path.join(migrationsDir, n)).isDirectory() && n.endsWith(LAB4_MIGRATION_SUFFIX)
  );
  return found ?? null;
}

function psqlExec(sql: string, opts?: { ignoreError?: boolean }): boolean {
  const r = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "sh", "-c",
     'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d postgres -c ' + JSON.stringify(sql)],
    { cwd: repoRoot, encoding: "utf-8" }
  );
  if (r.status !== 0 && !opts?.ignoreError) {
    console.error("psql error:", r.stderr);
  }
  return r.status === 0;
}

function run(cmd: string, label?: string): string {
  console.log(`  $ ${label ?? cmd}`);
  return execSync(cmd, { cwd: serverRoot, env: testEnv, encoding: "utf-8", stdio: "pipe" });
}

function runInherit(cmd: string): void {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: serverRoot, env: testEnv, stdio: "inherit" });
}

function hideLab4Migration(): string | null {
  const folder = findLab4Folder();
  if (!folder) return null;
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  fs.renameSync(path.join(migrationsDir, folder), path.join(tempDir, folder));
  return folder;
}

function restoreLab4Migration(folder: string): void {
  const src = path.join(tempDir, folder);
  const dest = path.join(migrationsDir, folder);
  if (fs.existsSync(src)) fs.renameSync(src, dest);
  cleanupTemp();
}

function cleanupTemp(): void {
  if (fs.existsSync(tempDir)) {
    const remaining = fs.readdirSync(tempDir);
    for (const f of remaining) {
      const src = path.join(tempDir, f);
      const dest = path.join(migrationsDir, f);
      if (!fs.existsSync(dest)) fs.renameSync(src, dest);
    }
    try { fs.rmdirSync(tempDir); } catch { /* ok */ }
  }
}

function verify(args: string, label: string): void {
  console.log(`\n  [verify] ${label}`);
  execSync(
    `npx tsx scripts/lab4-verify.ts ${args}`,
    { cwd: serverRoot, env: testEnv, stdio: "inherit" }
  );
}

function snapshot(): string {
  const out = run("npx tsx scripts/lab4-snapshot.ts", "db:snapshot");
  const match = out.match(/SNAPSHOT_FILE=(.+)/);
  if (!match) throw new Error("Could not parse snapshot file path from output:\n" + out);
  const file = match[1].trim();
  console.log(`  snapshot → ${file}`);
  return file;
}

function rollback(snapshotFile: string): void {
  // Call lab4-rollback but set --confirm via arg
  // It reads DATABASE_URL from process.env which is testEnv
  execSync(
    `npx tsx scripts/lab4-rollback.ts --confirm`,
    { cwd: serverRoot, env: testEnv, stdio: "inherit" }
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

let lab4Folder: string | null = null;
let allPassed = true;

async function runTest() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Lab 4 Upgrade Path Verification (test-upgrade-path-lab4.ts) ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  // ── Phase 0: ensure test DB is clean ──────────────────────────────────────
  console.log("[Phase 0] Preparing test database ...");
  psqlExec(`DROP DATABASE IF EXISTS ${TEST_DB};`, { ignoreError: true });
  const created = psqlExec(`CREATE DATABASE ${TEST_DB};`);
  if (!created) throw new Error(`Could not create test database ${TEST_DB}`);
  console.log(`  ✓ ${TEST_DB} created\n`);

  // ── Phase 1: Apply Lab 1-3 migrations only ────────────────────────────────
  console.log("[Phase 1] Hiding Lab 4 migration, deploying Lab 1-3 migrations ...");
  lab4Folder = hideLab4Migration();
  if (!lab4Folder) throw new Error("Lab 4 migration folder not found in migrations/");
  console.log(`  Hidden: ${lab4Folder}`);

  runInherit("npx prisma migrate deploy");
  console.log("  ✓ Migrations 1-9 applied\n");

  // ── Phase 2: Insert simulated Lab 3 data ──────────────────────────────────
  console.log("[Phase 2] Inserting simulated Lab 3 data ...");
  const prisma = getPrismaForTest();

  try {
    // Categories + RelatedSystems
    const [cat] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "Category" (name, "isActive", "createdAt") VALUES ('Test HW', true, NOW()) RETURNING id`
    );
    const catId = cat.id;
    const [sys] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "RelatedSystem" (name) VALUES ('Test System') RETURNING id`
    );
    const sysId = sys.id;

    // RequesterUsers (Lab 2 era)
    const req1 = (await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "RequesterUser" (name, email, "isActive", "createdAt") VALUES ('Alice Up', 'alice.up@example.com', true, NOW()) RETURNING id`
    ))[0];
    const req2 = (await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "RequesterUser" (name, email, "isActive", "createdAt") VALUES ('Bob Up', 'bob.up@example.com', true, NOW()) RETURNING id`
    ))[0];

    // Insert tickets for RequesterUser IDs before runUserMigration moves them
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

    // Prisma uses low-resolution CURRENT_TIMESTAMP here (3ms); sleep 1ms between
    // inserts to keep createdAt distinct if needed — but actually order by id is fine.
    for (const [tkt, status] of tktStatuses) {
      const rid = tkt <= "TKT-UP-005" ? req1.id : req2.id;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Ticket" ("ticketNumber", "requesterId", "categoryId", "relatedSystemId",
         summary, description, "requestedPriority", "currentStatus", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'Test description', 'HIGH'::\"Priority\", $6::\"TicketStatus\", NOW(), NOW())`,
        tkt, rid, catId, sysId, `Ticket ${tkt} ${status}`, status
      );
    }

    // runUserMigration: copies RequesterUsers → Users, updates requesterId FK
    const migResult = await runUserMigration(prisma);
    console.log(`  ✓ runUserMigration: ${migResult.migratedUsersCount} users, ${migResult.updatedTicketsCount} tickets`);

    // Direct Users (IT Staff, Admin)
    const [staff1] = await prisma.$queryRawUnsafe<[{ id: number }]>(
      `INSERT INTO "User" (name, email, "passwordHash", role, "isActive", "mustChangePassword", "createdAt", "updatedAt")
       VALUES ('Staff Up', 'staff.up@tiktockit.com', 'hash', 'IT_STAFF', true, false, NOW(), NOW()) RETURNING id`
    );

    // Assign owner to one ticket
    await prisma.$executeRawUnsafe(
      `UPDATE "Ticket" SET "ticketOwnerId" = $1 WHERE "ticketNumber" = 'TKT-UP-002'`,
      staff1.id
    );

    // A public comment and an internal note
    const ticketForComment = (await prisma.$queryRawUnsafe<[{ id: number }]>(
      `SELECT id FROM "Ticket" WHERE "ticketNumber" = 'TKT-UP-003'`
    ))[0];
    const requesterUser = (await prisma.$queryRawUnsafe<[{ id: number }]>(
      `SELECT id FROM "User" WHERE email = 'alice.up@example.com'`
    ))[0];

    if (ticketForComment && requesterUser) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PublicComment" ("ticketId", "authorId", content, "createdAt") VALUES ($1, $2, 'Test comment', NOW())`,
        ticketForComment.id, requesterUser.id
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "InternalNote" ("ticketId", "authorId", content, "createdAt") VALUES ($1, $2, 'Test note', NOW())`,
        ticketForComment.id, staff1.id
      );
    }

    const ticketCount = await prisma.ticket.count();
    const commentCount = await prisma.publicComment.count();
    console.log(`  ✓ ${ticketCount} tickets, ${commentCount} comments inserted\n`);
  } finally {
    await prisma.$disconnect();
  }

  // ── Phase 3: Snapshot ──────────────────────────────────────────────────────
  console.log("[Phase 3] Taking snapshot ...");
  const snapshotFile = snapshot();
  console.log();

  // ── Phase 4: Apply Lab 4 migration ────────────────────────────────────────
  console.log("[Phase 4] Restoring Lab 4 migration and deploying ...");
  restoreLab4Migration(lab4Folder);
  lab4Folder = null;
  runInherit("npx prisma migrate deploy");
  console.log("  ✓ Migration 10 applied\n");

  // ── Phase 5: Verify at-upgrade ────────────────────────────────────────────
  console.log("[Phase 5] Verifying at-upgrade ...");
  verify(`--snapshot "${snapshotFile}" --at-upgrade`, "MIG-01 + MIG-08 (at-upgrade)");
  console.log();

  // ── Phase 6: Rollback ─────────────────────────────────────────────────────
  console.log("[Phase 6] Rolling back (MIG-03) ...");
  rollback(snapshotFile);
  console.log("  ✓ Rollback done\n");

  // ── Phase 7: Verify after-rollback ────────────────────────────────────────
  console.log("[Phase 7] Verifying after rollback ...");
  verify(`--snapshot "${snapshotFile}" --after-rollback`, "MIG-03 + MIG-08 (after-rollback)");
  console.log();

  // ── Phase 8: Re-apply migration ───────────────────────────────────────────
  console.log("[Phase 8] Re-applying Lab 4 migration (proves idempotent deploy) ...");
  runInherit("npx prisma migrate deploy");
  console.log("  ✓ Second deploy succeeded\n");

  // ── Phase 9: Verify again ────────────────────────────────────────────────
  console.log("[Phase 9] Verifying at-upgrade (second deploy) ...");
  verify(`--snapshot "${snapshotFile}" --at-upgrade`, "MIG-08 second deploy");
  console.log();

  // ── Phase 10: Failure simulation (MIG-07) ────────────────────────────────
  console.log("[Phase 10] Failure simulation — bad migration inside a transaction (MIG-07) ...");

  // Roll back the good migration first so the bad copy can be applied
  rollback(snapshotFile);
  console.log("  ✓ Pre-failure rollback done");

  // Get the real migration folder name back (was restored from temp)
  const realFolder = findLab4Folder()!;
  const realSqlPath = path.join(migrationsDir, realFolder, "migration.sql");

  // Create a "bad" migration: copy the real SQL and append a failing statement
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const badSqlPath = path.join(tempDir, "migration_bad.sql");
  const goodSql = fs.readFileSync(realSqlPath, "utf-8");
  // Remove the final COMMIT, append a statement that will fail, then COMMIT
  const badSql = goodSql.replace(/COMMIT;\s*$/, "") +
    "\n-- INTENTIONAL FAILURE: alter a non-existent table\n" +
    "ALTER TABLE \"__nonexistent_table__\" ADD COLUMN \"col\" TEXT;\n\nCOMMIT;\n";
  fs.writeFileSync(badSqlPath, badSql);

  // Temporarily replace the good SQL with the bad one
  fs.renameSync(realSqlPath, realSqlPath + ".good_backup");
  fs.copyFileSync(badSqlPath, realSqlPath);

  // Try to deploy (must fail)
  let deployFailed = false;
  try {
    execSync("npx prisma migrate deploy", { cwd: serverRoot, env: testEnv, stdio: "pipe" });
  } catch {
    deployFailed = true;
    console.log("  ✓ Bad migration failed as expected (transaction rolled back)");
  }

  if (!deployFailed) {
    throw new Error("Expected the bad migration to fail, but it succeeded — SQL is not atomic!");
  }

  // Verify nothing partial remains
  verify("--expect-absent", "MIG-07: no partial schema after failure");

  // Resolve the failed migration
  console.log(`\n  Resolving rolled-back migration: ${realFolder}`);
  execSync(`npx prisma migrate resolve --rolled-back "${realFolder}"`,
    { cwd: serverRoot, env: testEnv, stdio: "inherit" });
  console.log("  ✓ Migration marked as rolled-back");

  // Restore the good SQL
  fs.renameSync(realSqlPath + ".good_backup", realSqlPath);
  fs.unlinkSync(badSqlPath);
  cleanupTemp();
  console.log("  ✓ Good migration SQL restored");

  // Re-deploy with the good migration
  console.log("\n  Re-deploying with the correct migration ...");
  runInherit("npx prisma migrate deploy");
  console.log("  ✓ Correct migration applied\n");

  // Final verify
  verify(`--snapshot "${snapshotFile}" --at-upgrade`, "MIG-07: verify after recovery");

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ✓  Upgrade Path Verification SUCCESSFUL (all phases)        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}

(async () => {
  try {
    await runTest();
  } catch (e) {
    console.error("\n❌ UPGRADE PATH TEST FAILED:", e);
    allPassed = false;
  } finally {
    // Always restore any hidden Lab 4 migration folder
    if (lab4Folder) restoreLab4Migration(lab4Folder);
    cleanupTemp();

    // Drop the test database
    console.log(`\n[Cleanup] Dropping test database ${TEST_DB} ...`);
    psqlExec(`DROP DATABASE IF EXISTS ${TEST_DB};`, { ignoreError: true });
    console.log(`  ✓ ${TEST_DB} dropped`);

    if (!allPassed) process.exit(1);
  }
})();
