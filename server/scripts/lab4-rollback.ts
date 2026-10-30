#!/usr/bin/env tsx
/**
 * db:rollback:lab4 — Rolls back the Lab 4 migration using prisma/rollback/lab4_down.sql.
 *
 * This script:
 *   1. Refuses to run without --confirm.
 *   2. Counts how many ActionTaken rows will be permanently lost.
 *   3. Exports all ActionTaken rows to backups/actions-taken-export-<UTC>.json.
 *   4. Executes lab4_down.sql in a single database transaction.
 *
 * Usage (from repo root):
 *   npm run db:rollback:lab4 --prefix server -- --confirm
 *
 * After the rollback, verify with:
 *   npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --after-rollback
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPrisma } from "../src/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");

const confirmed = process.argv.includes("--confirm");

if (!confirmed) {
  console.error(
    "[db:rollback:lab4] ERROR: --confirm flag is required.\n" +
    "  This will permanently delete the ActionTaken table and the three Lab 4\n" +
    "  Ticket columns.  Export and backup your data first, then run:\n\n" +
    "    npm run db:backup   --prefix server\n" +
    "    npm run db:snapshot --prefix server\n" +
    "    npm run db:rollback:lab4 --prefix server -- --confirm\n"
  );
  process.exit(1);
}

const sqlFile = path.join(serverRoot, "prisma", "rollback", "lab4_down.sql");
if (!fs.existsSync(sqlFile)) {
  console.error(`[db:rollback:lab4] SQL file not found: ${sqlFile}`);
  process.exit(1);
}

async function main() {
  const prisma = getPrisma();

  // ── Step 1: Count ActionTaken rows ──────────────────────────────────────────
  let actionCount = 0;
  let actionRows: unknown[] = [];

  try {
    const [{ count }] = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) AS count FROM "ActionTaken"`
    );
    actionCount = Number(count);
    actionRows  = await prisma.$queryRawUnsafe(`SELECT * FROM "ActionTaken" ORDER BY id ASC`);
  } catch {
    // ActionTaken may not exist (already rolled back) — that is fine
    console.log("[db:rollback:lab4] ActionTaken table not found — nothing to export.");
  }

  console.log(`[db:rollback:lab4] ActionTaken rows to be removed: ${actionCount}`);

  // ── Step 2: Export ActionTaken rows ─────────────────────────────────────────
  if (actionCount > 0) {
    const backupsDir = path.join(serverRoot, "backups");
    fs.mkdirSync(backupsDir, { recursive: true });
    const utcTag = new Date().toISOString().replace(/[:.]/g, "-");
    const exportFile = path.join(backupsDir, `actions-taken-export-${utcTag}.json`);

    fs.writeFileSync(exportFile, JSON.stringify({ exportedAt: new Date().toISOString(), rows: actionRows }, null, 2));
    console.log(`[db:rollback:lab4] ✓ Exported to ${exportFile}`);
  }

  await prisma.$disconnect();

  // ── Step 3: Execute lab4_down.sql via psql ───────────────────────────────────
  console.log(`\n[db:rollback:lab4] Executing ${path.relative(repoRoot, sqlFile)} ...`);
  const sqlContent = fs.readFileSync(sqlFile, "utf-8");

  const result = spawnSync(
    "docker",
    [
      "compose", "exec", "-T", "postgres",
      "sh", "-c",
      'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" "$POSTGRES_DB"',
    ],
    { cwd: repoRoot, input: sqlContent, encoding: "utf-8" }
  );

  if (result.error) {
    console.error("[db:rollback:lab4] Failed to spawn docker:", result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error("[db:rollback:lab4] psql exited with code", result.status);
    console.error(result.stderr);
    process.exit(1);
  }

  if (result.stdout) console.log(result.stdout);

  console.log("\n[db:rollback:lab4] ✓ Rollback complete.");
  console.log("\nNext steps:");
  console.log("  1. Verify: npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --after-rollback");
  console.log("  2. Run Lab 3 server tests as a smoke check: npm run test --prefix server");
  console.log("  3. Re-apply migration when ready: cd server && npx prisma migrate deploy");
}

main().catch(e => {
  console.error("[db:rollback:lab4] Fatal:", e);
  process.exit(1);
});
