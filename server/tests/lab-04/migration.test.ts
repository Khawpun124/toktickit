import { describe, it, expect } from "vitest";
import { getPrisma } from "../../src/prisma.js";

/**
 * Lab 4 schema structure on the dev database (read-only).
 *
 * Checks the tables, columns, defaults, foreign keys, and indexes created by the Lab 4
 * migration. The backfill values (MIG-02) are proven on a separate database by
 * scripts/test-upgrade-path-lab4.ts, because the dev database's data does not reflect
 * the moment of the upgrade.
 */
describe("Lab 4 schema structure (read-only checks against dev DB)", () => {
  const prisma = getPrisma();

  type Column = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

  async function columns(table: string): Promise<Map<string, Column>> {
    const rows = await prisma.$queryRawUnsafe<Column[]>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      table
    );
    return new Map(rows.map(r => [r.column_name, r]));
  }

  // [column, data_type, nullable, default] — default null means "no default"
  type Expected = [string, string, "YES" | "NO", string | null];

  function expectColumns(actual: Map<string, Column>, expected: Expected[]) {
    for (const [name, dataType, nullable, def] of expected) {
      const col = actual.get(name);
      expect(col, `column ${name}`).toBeDefined();
      expect(col!.data_type, `${name} type`).toBe(dataType);
      expect(col!.is_nullable, `${name} nullable`).toBe(nullable);
      expect(col!.column_default, `${name} default`).toBe(def);
    }
  }

  it("Ticket has version, resolvedAt, and statusChangedAt with the specified defaults", async () => {
    expectColumns(await columns("Ticket"), [
      ["version", "integer", "NO", "1"],
      ["resolvedAt", "timestamp without time zone", "YES", null],
      ["statusChangedAt", "timestamp without time zone", "NO", "CURRENT_TIMESTAMP"],
    ]);
  });

  it("ActionTaken has every specified column with its nullability and default", async () => {
    const actual = await columns("ActionTaken");
    expect(actual.get("id")?.column_default).toMatch(/^nextval\(/);
    expectColumns(actual, [
      ["ticketId", "integer", "NO", null],
      ["actionAt", "timestamp without time zone", "NO", null],
      ["description", "text", "NO", null],
      ["result", "text", "YES", null],
      ["performedById", "integer", "NO", null],
      ["assigneeId", "integer", "NO", null],
      ["status", "USER-DEFINED", "NO", `'PLANNED'::"ActionStatus"`],
      ["followUpRequired", "boolean", "NO", "false"],
      ["followUpNote", "text", "YES", null],
      ["attachmentNotes", "text", "YES", null],
      ["clientRequestId", "text", "YES", null],
      ["version", "integer", "NO", "1"],
      ["createdAt", "timestamp without time zone", "NO", "CURRENT_TIMESTAMP"],
      ["updatedAt", "timestamp without time zone", "NO", null],
    ]);
    expect(actual.size).toBe(15);
  });

  it("ActionStatus enum has exactly the four values in order", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(
      `SELECT e.enumlabel FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'ActionStatus'
       ORDER BY e.enumsortorder`
    );
    expect(rows.map(r => r.enumlabel)).toEqual(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
  });

  it("ActionTaken foreign keys restrict deletes", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ constraint_name: string; delete_rule: string }>>(
      `SELECT tc.constraint_name, rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
       WHERE tc.table_schema = 'public' AND tc.table_name = 'ActionTaken'
         AND tc.constraint_type = 'FOREIGN KEY'
       ORDER BY tc.constraint_name`
    );
    expect(rows).toEqual([
      { constraint_name: "ActionTaken_assigneeId_fkey", delete_rule: "RESTRICT" },
      { constraint_name: "ActionTaken_performedById_fkey", delete_rule: "RESTRICT" },
      { constraint_name: "ActionTaken_ticketId_fkey", delete_rule: "RESTRICT" },
    ]);
  });

  it("Lab 4 indexes exist and the Lab 1-3 Ticket indexes are kept", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename IN ('ActionTaken', 'Ticket')`
    );
    const names = rows.map(r => r.indexname);
    for (const name of [
      "ActionTaken_ticketId_createdAt_id_idx",
      "ActionTaken_ticketId_status_idx",
      "ActionTaken_assigneeId_status_idx",
      "Ticket_requesterId_currentStatus_idx",
      "Ticket_ticketOwnerId_currentStatus_idx",
      "Ticket_currentStatus_idx",
      "Ticket_requesterId_idx",
      "Ticket_ticketOwnerId_idx",
    ]) {
      expect(names, name).toContain(name);
    }
    const unique = rows.find(r => r.indexname === "ActionTaken_performedById_clientRequestId_key");
    expect(unique?.indexdef).toMatch(/^CREATE UNIQUE INDEX .*\("performedById", "clientRequestId"\)$/);
  });
});
