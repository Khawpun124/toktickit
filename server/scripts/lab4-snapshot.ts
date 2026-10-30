#!/usr/bin/env tsx
/**
 * db:snapshot — Captures row counts and per-row MD5 checksums for every
 * Lab 1-3 table (Session excluded because it changes constantly).
 *
 * Only the original Lab 1-3 columns of Ticket are hashed, so the three new
 * Lab 4 columns (version, resolvedAt, statusChangedAt) do not affect checksums.
 * The file holds only counts, ids, and md5 values, never the row values.
 *
 * Usage (from repo root):  npm run db:snapshot --prefix server
 * Output: server/backups/snapshot-<UTC>.json
 *         The file path is printed to stdout for use with db:verify:lab4.
 */
import fs from "fs";
import path from "path";
import { getPrisma } from "../src/prisma.js";
import { resolveTarget, serverRoot } from "./lib/lab4-db.js";
import {
  LAB13_TABLE_COLUMNS, SNAPSHOT_FORMAT, tableChecksums,
  type SnapshotFile, type TableSnapshot,
} from "./lib/lab4-tables.js";

async function main() {
  const target = resolveTarget("db:snapshot");
  const prisma = getPrisma();

  console.log("[db:snapshot] Computing per-row checksums ...\n");

  const tables: Record<string, TableSnapshot> = {};

  for (const [table, cols] of Object.entries(LAB13_TABLE_COLUMNS)) {
    tables[table] = await tableChecksums(prisma, table, cols);
    console.log(`  ${table.padEnd(16)} ${String(tables[table].count).padStart(5)} rows`);
  }

  const capturedAt = new Date().toISOString();
  const utcTag = capturedAt.replace(/[:.]/g, "-");
  const backupsDir = path.join(serverRoot, "backups");
  fs.mkdirSync(backupsDir, { recursive: true });
  const outFile = path.join(backupsDir, `snapshot-${utcTag}.json`);

  const snapshot: SnapshotFile = { format: SNAPSHOT_FORMAT, capturedAt, database: target.dbName, tables };
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));

  console.log(`\n[db:snapshot] ✓ Written to ${outFile}`);
  // Print the file path on its own line so callers can capture it
  console.log(`SNAPSHOT_FILE=${outFile}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error("[db:snapshot] Fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
