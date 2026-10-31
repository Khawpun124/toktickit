#!/usr/bin/env tsx
/**
 * db:verify:lab4 — Post-migration and post-rollback verification.
 *
 * Modes (exactly one):
 *   --snapshot <file>                   After the upgrade: every Lab 1-3 table matches the
 *                                       snapshot, ActionTaken exists with 0 rows, and the
 *                                       backfill invariants hold.
 *   --snapshot <file> --at-upgrade      The same, plus resolvedAt = updatedAt (RESOLVED and
 *                                       CLOSED) and statusChangedAt = updatedAt, which hold
 *                                       only right after the migration.
 *   --snapshot <file> --after-rollback  ActionTaken, the enum, the three Ticket columns, and
 *                                       the Lab 4 migration record are gone, and every Lab 1-3
 *                                       table matches the snapshot.
 *   --expect-absent                     After a failed migration: ActionTaken, the enum, and
 *                                       the three Ticket columns do not exist (no snapshot).
 *
 * Output: A result table printed to stdout (check, before, after, match).
 * Exit code: 0 when all checks pass, 1 on any failure.
 *
 * Usage (from repo root):
 *   npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --at-upgrade
 */
import fs from "fs";
import path from "path";
import { getPrisma } from "../src/prisma.js";
import { resolveTarget, serverRoot } from "./lib/lab4-db.js";
import { LAB13_TABLE_COLUMNS, SNAPSHOT_FORMAT, tableChecksums, type SnapshotFile } from "./lib/lab4-tables.js";

// ─── Argument parsing ────────────────────────────────────────────────────────

const USAGE =
  "Usage: --snapshot <file> [--at-upgrade | --after-rollback]\n" +
  "   or: --expect-absent";

const args = process.argv.slice(2);
const snapshotIdx = args.indexOf("--snapshot");
const snapshotFile = snapshotIdx !== -1 ? args[snapshotIdx + 1] : null;
const atUpgrade      = args.includes("--at-upgrade");
const afterRollback  = args.includes("--after-rollback");
const expectAbsent   = args.includes("--expect-absent");

function usageError(message: string): never {
  console.error(`[db:verify:lab4] ${message}\n${USAGE}`);
  process.exit(1);
}

if (snapshotIdx !== -1 && (!snapshotFile || snapshotFile.startsWith("--"))) {
  usageError("--snapshot needs a file path");
}
if (expectAbsent && (snapshotFile || atUpgrade || afterRollback)) {
  usageError("--expect-absent cannot be combined with other flags");
}
if (atUpgrade && afterRollback) usageError("--at-upgrade and --after-rollback cannot be combined");
if (!expectAbsent && !snapshotFile) usageError("--snapshot <file> is required unless --expect-absent is used");

type Mode = "expect-absent" | "after-rollback" | "post-upgrade";
const mode: Mode = expectAbsent ? "expect-absent" : afterRollback ? "after-rollback" : "post-upgrade";

// ─── Types ───────────────────────────────────────────────────────────────────

type Result = {
  check: string;
  before: string;
  after: string;
  pass: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(s: string, width: number) {
  return s.length <= width ? s.padEnd(width) : s.slice(0, width - 1) + "…";
}

function printTable(results: Result[]) {
  const cw = Math.max(40, ...results.map(r => r.check.length + 2));
  const bw = Math.max(10, ...results.map(r => r.before.length + 2));
  const aw = Math.max(10, ...results.map(r => r.after.length + 2));
  const sep = `+${"-".repeat(cw)}+${"-".repeat(bw)}+${"-".repeat(aw)}+-------+`;
  console.log(sep);
  console.log(`| ${fmt("Check", cw - 2)} | ${fmt("Before", bw - 2)} | ${fmt("After", aw - 2)} | Match |`);
  console.log(sep);
  for (const r of results) {
    const m = r.pass ? "  ✓  " : "  ✗  ";
    console.log(`| ${fmt(r.check, cw - 2)} | ${fmt(r.before, bw - 2)} | ${fmt(r.after, aw - 2)} | ${m} |`);
  }
  console.log(sep);
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

type Prisma = ReturnType<typeof getPrisma>;

async function tableExists(prisma: Prisma, table: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
    table
  );
  return r[0]?.exists ?? false;
}

async function columnExists(prisma: Prisma, table: string, column: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2) AS exists`,
    table, column
  );
  return r[0]?.exists ?? false;
}

async function enumExists(prisma: Prisma, name: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE n.nspname = 'public' AND t.typname = $1) AS exists`,
    name
  );
  return r[0]?.exists ?? false;
}

async function migrationRecordExists(prisma: Prisma): Promise<boolean> {
  try {
    const r = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE migration_name LIKE '%_add_actions_taken_and_workflow_fields'`
    );
    return BigInt(r[0]?.count ?? 0) > 0n;
  } catch {
    return false;
  }
}

async function countWhere(prisma: Prisma, where: string): Promise<bigint> {
  const [{ count }] = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*) AS count FROM "Ticket" WHERE ${where}`
  );
  return count;
}

// ─── Check groups ────────────────────────────────────────────────────────────

async function absenceChecks(prisma: Prisma, results: Result[]) {
  const present = (exists: boolean) => (exists ? "EXISTS" : "absent");
  const checks: Array<[string, boolean]> = [
    ["ActionTaken table absent", await tableExists(prisma, "ActionTaken")],
    ["ActionStatus enum absent", await enumExists(prisma, "ActionStatus")],
    ["Ticket.version absent", await columnExists(prisma, "Ticket", "version")],
    ["Ticket.resolvedAt absent", await columnExists(prisma, "Ticket", "resolvedAt")],
    ["Ticket.statusChangedAt absent", await columnExists(prisma, "Ticket", "statusChangedAt")],
  ];
  for (const [check, exists] of checks) {
    results.push({ check, before: "absent", after: present(exists), pass: !exists });
  }
}

async function snapshotChecks(prisma: Prisma, snapshot: SnapshotFile, results: Result[]) {
  for (const [table, cols] of Object.entries(LAB13_TABLE_COLUMNS)) {
    const snap = snapshot.tables[table];
    if (!snap) {
      results.push({ check: `${table} in snapshot`, before: "n/a", after: "missing from snapshot", pass: false });
      continue;
    }

    const live = await tableChecksums(prisma, table, cols);

    results.push({
      check: `${table} row count`,
      before: String(snap.count),
      after: String(live.count),
      pass: live.count === snap.count,
    });

    const liveMap = new Map(live.rows.map(r => [r.id, r.rowMd5]));
    const snapIds = new Set(snap.rows.map(r => r.id));
    let changed = 0;
    let missing = 0;
    for (const { id, rowMd5 } of snap.rows) {
      const md5 = liveMap.get(id);
      if (md5 === undefined) missing++;
      else if (md5 !== rowMd5) changed++;
    }
    const extra = live.rows.filter(r => !snapIds.has(r.id)).length;
    const ok = changed === 0 && missing === 0 && extra === 0;
    results.push({
      check: `${table} checksums`,
      before: `${snap.rows.length} rows`,
      after: ok ? "all match" : `${changed} changed, ${missing} missing, ${extra} extra`,
      pass: ok,
    });
  }
}

async function postUpgradeChecks(prisma: Prisma, results: Result[]) {
  const atExists = await tableExists(prisma, "ActionTaken");
  results.push({ check: "ActionTaken table exists", before: "n/a", after: atExists ? "exists" : "MISSING", pass: atExists });

  if (atExists) {
    const [{ count }] = await prisma.$queryRawUnsafe<[{ count: bigint }]>(`SELECT COUNT(*) AS count FROM "ActionTaken"`);
    results.push({ check: "ActionTaken has 0 rows", before: "0", after: String(count), pass: count === 0n });
  }

  const badVersion = await countWhere(prisma, `"version" <> 1`);
  results.push({ check: "All Tickets have version = 1", before: "0 bad", after: `${badVersion} bad`, pass: badVersion === 0n });

  const nullResolved = await countWhere(prisma, `"currentStatus" IN ('RESOLVED','CLOSED') AND "resolvedAt" IS NULL`);
  results.push({ check: "RESOLVED/CLOSED have resolvedAt", before: "0 NULL", after: `${nullResolved} NULL`, pass: nullResolved === 0n });

  const badResolved = await countWhere(prisma, `"currentStatus" NOT IN ('RESOLVED','CLOSED') AND "resolvedAt" IS NOT NULL`);
  results.push({ check: "Non-resolved have resolvedAt NULL", before: "0 bad", after: `${badResolved} bad`, pass: badResolved === 0n });

  const nullSca = await countWhere(prisma, `"statusChangedAt" IS NULL`);
  results.push({ check: "No Ticket has statusChangedAt NULL", before: "0 NULL", after: `${nullSca} NULL`, pass: nullSca === 0n });
}

async function atUpgradeChecks(prisma: Prisma, results: Result[]) {
  const resolvedMismatch = await countWhere(
    prisma, `"currentStatus" IN ('RESOLVED','CLOSED') AND "resolvedAt" IS DISTINCT FROM "updatedAt"`
  );
  results.push({
    check: "RESOLVED/CLOSED resolvedAt = updatedAt", before: "0 mismatch",
    after: `${resolvedMismatch} mismatch`, pass: resolvedMismatch === 0n,
  });

  const scaMismatch = await countWhere(prisma, `"statusChangedAt" IS DISTINCT FROM "updatedAt"`);
  results.push({
    check: "All Tickets statusChangedAt = updatedAt", before: "0 mismatch",
    after: `${scaMismatch} mismatch`, pass: scaMismatch === 0n,
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const target = resolveTarget("db:verify:lab4");
  console.log(`[db:verify:lab4] Mode: ${mode}${atUpgrade ? " + at-upgrade" : ""}`);
  const prisma = getPrisma();
  const results: Result[] = [];

  let snapshot: SnapshotFile | null = null;
  if (snapshotFile) {
    const resolved = path.isAbsolute(snapshotFile) ? snapshotFile : path.join(serverRoot, snapshotFile);
    snapshot = JSON.parse(fs.readFileSync(resolved, "utf-8")) as SnapshotFile;
    console.log(`[db:verify:lab4] Snapshot: ${resolved} (captured ${snapshot.capturedAt})\n`);
    results.push({
      check: "Snapshot format", before: String(SNAPSHOT_FORMAT),
      after: String(snapshot.format ?? "none"), pass: snapshot.format === SNAPSHOT_FORMAT,
    });
    results.push({
      check: "Snapshot database", before: String(snapshot.database ?? "none"),
      after: target.dbName, pass: snapshot.database === target.dbName,
    });
  }

  if (mode === "expect-absent" || mode === "after-rollback") {
    await absenceChecks(prisma, results);
  }
  if (mode === "after-rollback") {
    const migRec = await migrationRecordExists(prisma);
    results.push({ check: "Lab 4 migration record absent", before: "absent", after: migRec ? "EXISTS" : "absent", pass: !migRec });
  }
  if (snapshot && results.every(r => r.pass || !r.check.startsWith("Snapshot "))) {
    await snapshotChecks(prisma, snapshot, results);
  }
  if (mode === "post-upgrade") {
    await postUpgradeChecks(prisma, results);
    if (atUpgrade) await atUpgradeChecks(prisma, results);
  }

  // ── Print and exit ───────────────────────────────────────────────────────────
  const failures = results.filter(r => !r.pass).length;
  console.log(`\n[db:verify:lab4] Results (${results.length} checks, ${failures} failure(s))\n`);
  printTable(results);

  if (failures > 0) {
    console.error(`\n[db:verify:lab4] ✗ ${failures} check(s) FAILED`);
  } else {
    console.log(`\n[db:verify:lab4] ✓ All checks passed`);
  }

  await prisma.$disconnect();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("[db:verify:lab4] Fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
