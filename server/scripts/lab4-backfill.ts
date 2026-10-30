#!/usr/bin/env tsx
/**
 * db:backfill:lab4 — Runs the idempotent backfill UPDATE statements from the
 * Lab 4 migration and prints how many rows changed.  Running a second time
 * should always print 0 for both UPDATEs.
 *
 * Usage (from repo root):  npm run db:backfill:lab4 --prefix server
 */
import { getPrisma } from "../src/prisma.js";
import { resolveTarget } from "./lib/lab4-db.js";

async function main() {
  resolveTarget("db:backfill:lab4");
  const prisma = getPrisma();

  console.log("[db:backfill:lab4] Running idempotent backfill ...\n");

  // resolvedAt = updatedAt for RESOLVED and CLOSED tickets that still have NULL
  const resolvedResult = await prisma.$executeRawUnsafe(
    `UPDATE "Ticket" SET "resolvedAt" = "updatedAt"
     WHERE "currentStatus" IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NULL`
  );
  console.log(`  resolvedAt backfill:       ${resolvedResult} row(s) updated`);

  // statusChangedAt = updatedAt for all tickets that still have NULL
  const statusResult = await prisma.$executeRawUnsafe(
    `UPDATE "Ticket" SET "statusChangedAt" = "updatedAt" WHERE "statusChangedAt" IS NULL`
  );
  console.log(`  statusChangedAt backfill:  ${statusResult} row(s) updated`);

  const total = resolvedResult + statusResult;
  if (total === 0) {
    console.log("\n[db:backfill:lab4] ✓ Nothing to update — already fully backfilled.");
  } else {
    console.log(`\n[db:backfill:lab4] ✓ Done — ${total} row(s) updated total.`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error("[db:backfill:lab4] Fatal:", e);
  process.exit(1);
});
