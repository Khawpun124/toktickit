#!/usr/bin/env tsx
/**
 * db:verify:lab4 — Post-migration and post-rollback verification.
 *
 * Flags:
 *   --snapshot <file>   Path to a snapshot JSON from db:snapshot. Required unless
 *                       --expect-absent is the only flag.
 *   --at-upgrade        Additional checks that hold immediately after the Lab 4
 *                       migration (resolvedAt = updatedAt, statusChangedAt = updatedAt).
 *   --after-rollback    Verify Lab 4 objects are gone AND data matches the snapshot.
 *   --expect-absent     Only check that Lab 4 DB objects do not exist (no snapshot needed).
 *
 * Output: A result table printed to stdout (table, before, after, match).
 * Exit code: 0 when all checks pass, 1 on any failure.
 *
 * Usage (from repo root):
 *   npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --at-upgrade
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPrisma } from "../src/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");

// ─── Argument parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const snapshotIdx = args.indexOf("--snapshot");
const snapshotFile = snapshotIdx !== -1 ? args[snapshotIdx + 1] : null;
const atUpgrade      = args.includes("--at-upgrade");
const afterRollback  = args.includes("--after-rollback");
const expectAbsent   = args.includes("--expect-absent");

if (!atUpgrade && !afterRollback && !expectAbsent) {
  console.error("Usage: --snapshot <file> [--at-upgrade | --after-rollback | --expect-absent]");
  process.exit(1);
}

if ((atUpgrade || afterRollback) && !snapshotFile) {
  console.error("--snapshot <file> is required with --at-upgrade and --after-rollback");
  process.exit(1);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type RowEntry = { id: number; rowMd5: string };
type TableSnapshot = { count: number; rows: RowEntry[] };
type SnapshotFile = { capturedAt: string; tables: Record<string, TableSnapshot> };

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

const TABLE_COLUMNS: Record<string, string[]> = {
  Category: ["id", "name", "isActive", "createdAt"],
  RequesterUser: ["id", "name", "email", "isActive", "createdAt"],
  RelatedSystem: ["id", "name", "isActive"],
  User: ["id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "createdAt", "updatedAt"],
  Ticket: [
    "id", "ticketNumber", "requesterId", "ticketOwnerId",
    "categoryId", "relatedSystemId", "summary", "description",
    "requestedPriority", "itPriority", "currentStatus",
    "problemAppearsResolved", "createdAt", "updatedAt",
  ],
  Attachment: ["id", "ticketId", "fileName", "storedFileName", "mimeType", "sizeBytes", "uploadedAt", "removedAt", "removedReason"],
  PublicComment: ["id", "ticketId", "authorId", "content", "createdAt"],
  InternalNote:  ["id", "ticketId", "authorId", "content", "createdAt"],
};

async function tableExists(prisma: ReturnType<typeof getPrisma>, table: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
    table
  );
  return r[0]?.exists ?? false;
}

async function columnExists(prisma: ReturnType<typeof getPrisma>, table: string, column: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2) AS exists`,
    table, column
  );
  return r[0]?.exists ?? false;
}

async function enumExists(prisma: ReturnType<typeof getPrisma>, name: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = $1) AS exists`,
    name
  );
  return r[0]?.exists ?? false;
}

async function migrationRecordExists(prisma: ReturnType<typeof getPrisma>): Promise<boolean> {
  try {
    const r = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE migration_name LIKE '%_add_actions_taken_and_workflow_fields'`
    );
    return BigInt(r[0]?.count ?? 0) > 0n;
  } catch {
    return false;
  }
}

async function getTableChecksum(
  prisma: ReturnType<typeof getPrisma>,
  table: string,
  cols: string[]
): Promise<{ count: number; rows: RowEntry[] }> {
  const colExpr = cols.map(c => `COALESCE("${c}"::text, '')`).join(", '|', ");
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; row_md5: string }>>(
    `SELECT id, md5(concat_ws('|', ${colExpr})) AS row_md5 FROM "${table}" ORDER BY id ASC`
  );
  return { count: rows.length, rows: rows.map(r => ({ id: Number(r.id), rowMd5: r.row_md5 })) };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const prisma = getPrisma();
  const results: Result[] = [];
  let snapshot: SnapshotFile | null = null;

  if (snapshotFile) {
    const resolved = path.isAbsolute(snapshotFile)
      ? snapshotFile
      : path.join(serverRoot, snapshotFile);
    snapshot = JSON.parse(fs.readFileSync(resolved, "utf-8")) as SnapshotFile;
    console.log(`[db:verify:lab4] Snapshot: ${resolved} (captured ${snapshot.capturedAt})\n`);
  }

  // ── --expect-absent / --after-rollback: Lab 4 objects must not exist ────────
  if (expectAbsent || afterRollback) {
    const atExists    = await tableExists(prisma, "ActionTaken");
    const enumEx      = await enumExists(prisma, "ActionStatus");
    const verCol      = await columnExists(prisma, "Ticket", "version");
    const resolvedCol = await columnExists(prisma, "Ticket", "resolvedAt");
    const scaCol      = await columnExists(prisma, "Ticket", "statusChangedAt");
    const migRec      = await migrationRecordExists(prisma);

    results.push({ check: 'ActionTaken table absent', before: 'absent', after: atExists ? 'EXISTS' : 'absent', pass: !atExists });
    results.push({ check: 'ActionStatus enum absent', before: 'absent', after: enumEx ? 'EXISTS' : 'absent', pass: !enumEx });
    results.push({ check: 'Ticket.version absent',    before: 'absent', after: verCol ? 'EXISTS' : 'absent', pass: !verCol });
    results.push({ check: 'Ticket.resolvedAt absent', before: 'absent', after: resolvedCol ? 'EXISTS' : 'absent', pass: !resolvedCol });
    results.push({ check: 'Ticket.statusChangedAt absent', before: 'absent', after: scaCol ? 'EXISTS' : 'absent', pass: !scaCol });
    results.push({ check: 'Lab 4 migration record absent', before: 'absent', after: migRec ? 'EXISTS' : 'absent', pass: !migRec });
  }

  // ── --at-upgrade / --after-rollback: compare snapshot ───────────────────────
  if ((atUpgrade || afterRollback) && snapshot) {
    for (const [table, cols] of Object.entries(TABLE_COLUMNS)) {
      const snap = snapshot.tables[table];
      if (!snap) {
        results.push({ check: `${table} in snapshot`, before: 'n/a', after: 'missing from snapshot', pass: false });
        continue;
      }

      const live = await getTableChecksum(prisma, table, cols);

      // Row count
      results.push({
        check: `${table} row count`,
        before: String(snap.count),
        after: String(live.count),
        pass: live.count === snap.count,
      });

      // Per-row checksum match
      const snapMap = new Map(snap.rows.map(r => [r.id, r.rowMd5]));
      const liveMap = new Map(live.rows.map(r => [r.id, r.rowMd5]));
      let mismatch = 0;
      for (const [id, md5] of snapMap) {
        if (liveMap.get(id) !== md5) mismatch++;
      }
      results.push({
        check: `${table} checksums`,
        before: `${snap.rows.length} rows`,
        after: mismatch === 0 ? 'all match' : `${mismatch} mismatch(es)`,
        pass: mismatch === 0,
      });
    }
  }

  // ── --at-upgrade: extra Lab 4 structural / backfill checks ──────────────────
  if (atUpgrade) {
    // ActionTaken exists and is empty
    const atExists = await tableExists(prisma, "ActionTaken");
    results.push({ check: 'ActionTaken table exists', before: 'n/a', after: atExists ? 'exists' : 'MISSING', pass: atExists });

    if (atExists) {
      const [{ count }] = await prisma.$queryRawUnsafe<[{ count: bigint }]>(`SELECT COUNT(*) AS count FROM "ActionTaken"`);
      results.push({ check: 'ActionTaken has 0 rows', before: '0', after: String(count), pass: count === 0n });
    }

    // version = 1 for all Tickets
    const [{ bad_version }] = await prisma.$queryRawUnsafe<[{ bad_version: bigint }]>(
      `SELECT COUNT(*) AS bad_version FROM "Ticket" WHERE "version" <> 1`
    );
    results.push({ check: 'All Tickets have version = 1', before: '0 bad', after: `${bad_version} bad`, pass: bad_version === 0n });

    // No RESOLVED/CLOSED Ticket with resolvedAt NULL
    const [{ null_resolved }] = await prisma.$queryRawUnsafe<[{ null_resolved: bigint }]>(
      `SELECT COUNT(*) AS null_resolved FROM "Ticket" WHERE "currentStatus" IN ('RESOLVED','CLOSED') AND "resolvedAt" IS NULL`
    );
    results.push({ check: 'RESOLVED/CLOSED have resolvedAt', before: '0 NULL', after: `${null_resolved} NULL`, pass: null_resolved === 0n });

    // resolvedAt = updatedAt for RESOLVED/CLOSED (only at-upgrade)
    const [{ at_mismatch }] = await prisma.$queryRawUnsafe<[{ at_mismatch: bigint }]>(
      `SELECT COUNT(*) AS at_mismatch FROM "Ticket" WHERE "currentStatus" IN ('RESOLVED','CLOSED') AND "resolvedAt" <> "updatedAt"`
    );
    results.push({ check: 'RESOLVED/CLOSED resolvedAt = updatedAt', before: '0 mismatch', after: `${at_mismatch} mismatch`, pass: at_mismatch === 0n });

    // Other statuses have resolvedAt NULL
    const [{ bad_resolvedat }] = await prisma.$queryRawUnsafe<[{ bad_resolvedat: bigint }]>(
      `SELECT COUNT(*) AS bad_resolvedat FROM "Ticket" WHERE "currentStatus" NOT IN ('RESOLVED','CLOSED') AND "resolvedAt" IS NOT NULL`
    );
    results.push({ check: 'Non-resolved have resolvedAt NULL', before: '0 bad', after: `${bad_resolvedat} bad`, pass: bad_resolvedat === 0n });

    // No Ticket with statusChangedAt NULL
    const [{ null_sca }] = await prisma.$queryRawUnsafe<[{ null_sca: bigint }]>(
      `SELECT COUNT(*) AS null_sca FROM "Ticket" WHERE "statusChangedAt" IS NULL`
    );
    results.push({ check: 'No Ticket has statusChangedAt NULL', before: '0 NULL', after: `${null_sca} NULL`, pass: null_sca === 0n });

    // statusChangedAt = updatedAt for all Tickets (only at-upgrade)
    const [{ sca_mismatch }] = await prisma.$queryRawUnsafe<[{ sca_mismatch: bigint }]>(
      `SELECT COUNT(*) AS sca_mismatch FROM "Ticket" WHERE "statusChangedAt" <> "updatedAt"`
    );
    results.push({ check: 'All Tickets statusChangedAt = updatedAt', before: '0 mismatch', after: `${sca_mismatch} mismatch`, pass: sca_mismatch === 0n });
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
  console.error("[db:verify:lab4] Fatal:", e);
  process.exit(1);
});
