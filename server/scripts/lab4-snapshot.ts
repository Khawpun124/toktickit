#!/usr/bin/env tsx
/**
 * db:snapshot — Captures row counts and per-row MD5 checksums for every
 * Lab 1-3 table (Session excluded because it changes constantly).
 *
 * Only the original Lab 1-3 columns of Ticket are hashed, so the three new
 * Lab 4 columns (version, resolvedAt, statusChangedAt) do not affect checksums.
 *
 * Usage (from repo root):  npm run db:snapshot --prefix server
 * Output: server/backups/snapshot-<UTC>.json
 *         The file path is printed to stdout for use with db:verify:lab4.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPrisma } from "../src/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");

// Columns per table.
// Ticket deliberately omits version, resolvedAt, and statusChangedAt so the
// snapshot reflects the Lab 1-3 data shape.
const TABLE_COLUMNS: Record<string, string[]> = {
  Category: ["id", "name", "isActive", "createdAt"],
  RequesterUser: ["id", "name", "email", "isActive", "createdAt"],
  RelatedSystem: ["id", "name", "isActive"],
  User: [
    "id", "name", "email", "passwordHash", "role",
    "isActive", "mustChangePassword", "createdAt", "updatedAt",
  ],
  Ticket: [
    "id", "ticketNumber", "requesterId", "ticketOwnerId",
    "categoryId", "relatedSystemId", "summary", "description",
    "requestedPriority", "itPriority", "currentStatus",
    "problemAppearsResolved", "createdAt", "updatedAt",
  ],
  Attachment: [
    "id", "ticketId", "fileName", "storedFileName",
    "mimeType", "sizeBytes", "uploadedAt", "removedAt", "removedReason",
  ],
  PublicComment: ["id", "ticketId", "authorId", "content", "createdAt"],
  InternalNote:  ["id", "ticketId", "authorId", "content", "createdAt"],
  // Session is intentionally excluded — it changes on every login.
};

type RowEntry = { id: number; rowMd5: string };
type TableSnapshot = { count: number; rows: RowEntry[] };

async function main() {
  const prisma = getPrisma();

  console.log("[db:snapshot] Computing per-row checksums ...\n");

  const tables: Record<string, TableSnapshot> = {};

  for (const [table, cols] of Object.entries(TABLE_COLUMNS)) {
    // Build a md5(concat_ws(...)) expression over all chosen columns.
    // COALESCE to empty string so NULL values produce a consistent hash.
    const colExpr = cols
      .map(c => `COALESCE("${c}"::text, '')`)
      .join(", '|', ");

    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; row_md5: string }>>(
      `SELECT id, md5(concat_ws('|', ${colExpr})) AS row_md5 FROM "${table}" ORDER BY id ASC`
    );

    tables[table] = {
      count: rows.length,
      rows: rows.map(r => ({ id: Number(r.id), rowMd5: r.row_md5 })),
    };

    console.log(`  ${table.padEnd(16)} ${String(rows.length).padStart(5)} rows`);
  }

  const capturedAt = new Date().toISOString();
  const utcTag = capturedAt.replace(/[:.]/g, "-");
  const backupsDir = path.join(serverRoot, "backups");
  fs.mkdirSync(backupsDir, { recursive: true });
  const outFile = path.join(backupsDir, `snapshot-${utcTag}.json`);

  fs.writeFileSync(outFile, JSON.stringify({ capturedAt, tables }, null, 2));

  console.log(`\n[db:snapshot] ✓ Written to ${outFile}`);
  // Print the file path on its own line so callers can capture it
  console.log(`SNAPSHOT_FILE=${outFile}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error("[db:snapshot] Fatal:", e);
  process.exit(1);
});
