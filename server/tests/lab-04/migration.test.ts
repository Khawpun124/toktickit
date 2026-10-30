import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";

/**
 * MIG-02 — Lab 4 migration backfill verification.
 *
 * Verifies that the applied migration.sql produced the expected data state
 * on the current dev database (no schema changes are made by this test):
 *   - version = 1 for every Ticket
 *   - resolvedAt IS NOT NULL for every RESOLVED or CLOSED Ticket
 *   - statusChangedAt IS NOT NULL for every Ticket
 *   - ActionTaken table exists and is accessible
 */
describe("MIG-02: Lab 4 migration backfill (read-only checks against dev DB)", () => {
  const prisma = getPrisma();

  it("Every Ticket has version = 1", async () => {
    const bad = await prisma.$queryRawUnsafe<Array<{ id: number; version: number }>>(
      `SELECT id, version FROM "Ticket" WHERE version <> 1`
    );
    expect(bad, `Tickets with version <> 1: ${JSON.stringify(bad)}`).toHaveLength(0);
  });

  it("Every RESOLVED or CLOSED Ticket has resolvedAt NOT NULL", async () => {
    const bad = await prisma.$queryRawUnsafe<Array<{ id: number; currentStatus: string }>>(
      `SELECT id, "currentStatus" FROM "Ticket"
       WHERE "currentStatus" IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NULL`
    );
    expect(bad, `RESOLVED/CLOSED with NULL resolvedAt: ${JSON.stringify(bad)}`).toHaveLength(0);
  });

  it("No Ticket in a non-resolved status has resolvedAt set", async () => {
    const bad = await prisma.$queryRawUnsafe<Array<{ id: number; currentStatus: string }>>(
      `SELECT id, "currentStatus" FROM "Ticket"
       WHERE "currentStatus" NOT IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NOT NULL`
    );
    expect(bad, `Non-resolved Tickets with resolvedAt: ${JSON.stringify(bad)}`).toHaveLength(0);
  });

  it("Every Ticket has statusChangedAt NOT NULL", async () => {
    const bad = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM "Ticket" WHERE "statusChangedAt" IS NULL`
    );
    expect(bad, `Tickets with NULL statusChangedAt: ${JSON.stringify(bad)}`).toHaveLength(0);
  });

  it("ActionTaken table exists and is accessible", async () => {
    // A simple COUNT query; proves the table exists and columns are reachable
    const [{ count }] = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) AS count FROM "ActionTaken"`
    );
    expect(typeof count).toBe("bigint");
    // count can be >= 0; we only care that the query runs
  });

  it("ActionStatus enum exists with expected values", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(
      `SELECT e.enumlabel FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'ActionStatus'
       ORDER BY e.enumsortorder`
    );
    const labels = rows.map(r => r.enumlabel);
    expect(labels).toContain("PLANNED");
    expect(labels).toContain("IN_PROGRESS");
    expect(labels).toContain("COMPLETED");
    expect(labels).toContain("CANCELLED");
  });

  it("Ticket table has the three new Lab 4 columns", async () => {
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Ticket'
       AND column_name IN ('version', 'resolvedAt', 'statusChangedAt')`
    );
    const names = cols.map(c => c.column_name);
    expect(names).toContain("version");
    expect(names).toContain("resolvedAt");
    expect(names).toContain("statusChangedAt");
  });
});
