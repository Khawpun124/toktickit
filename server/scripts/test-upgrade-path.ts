import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPrisma } from "../src/prisma.js";
import { runUserMigration } from "../src/utils/migrate-users.js";
import { comparePassword } from "../src/utils/password.js";
import { MIGRATED_USER_INITIAL_PASSWORD } from "../src/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(serverRoot, "prisma", "migrations");
const tempDir = path.join(serverRoot, "prisma", ".lab3_temp_migrations");

const lab3MigrationFolders = [
  "20260914113900_add_user_and_session_models",
  "20260917074744_add_comments_and_notes",
  "20260917154933_make_ticket_requester_fk_deferrable",
  "20260917155038_restore_ticket_requester_fk",
];

// Discover Lab 4 migration folder(s) dynamically so we do not hard-code the
// timestamp. Any folder whose name ends with _add_actions_taken_and_workflow_fields
// is considered a Lab 4 migration that must be hidden during the Lab 2→3 upgrade
// simulation (otherwise "migrate deploy" at Step 3 would try to apply it against
// an incomplete schema and fail). These folders are moved back in the finally block
// but NOT restored at Step 5 — the Lab 3 upgrade test must not include Lab 4.
function findLab4MigrationFolders(): string[] {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs.readdirSync(migrationsDir).filter(
    (name) =>
      fs.statSync(path.join(migrationsDir, name)).isDirectory() &&
      name.endsWith("_add_actions_taken_and_workflow_fields")
  );
}

async function runUpgradePathTest() {
  console.log("==================================================");
  console.log(" Starting Upgrade Path Verification Test ");
  console.log("==================================================\n");

  const prisma = getPrisma();

  try {
    // Step 1: Clean Database schema
    console.log("[Step 1/8] Cleaning database schema (DROP SCHEMA public CASCADE)...");
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE;`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA public;`);
    console.log("  ✓ Database schema cleaned.\n");

    // Step 2: Move Lab 3 AND Lab 4 migrations out temporarily so that
    // "migrate deploy" at Step 3 only sees the Lab 1-2 migrations.
    // Lab 4 folders are NOT restored at Step 5 — they stay in tempDir for
    // the duration of this test and are returned only in the finally block.
    console.log("[Step 2/8] Isolating Lab 2 migrations (hiding Lab 3 + Lab 4)...");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const lab4MigrationFolders = findLab4MigrationFolders();
    const foldersToHide = [...lab3MigrationFolders, ...lab4MigrationFolders];
    for (const folder of foldersToHide) {
      const src = path.join(migrationsDir, folder);
      const dest = path.join(tempDir, folder);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
      }
    }
    if (lab4MigrationFolders.length > 0) {
      console.log(`  ✓ Lab 4 migration(s) also hidden: ${lab4MigrationFolders.join(", ")}`);
    }
    console.log("  ✓ Lab 3 migrations isolated.\n");

    // Step 3: Apply Lab 2 migrations (1-5)
    console.log("[Step 3/8] Applying Lab 2 migrations (1-5)...");
    execSync("npx prisma migrate deploy", { cwd: serverRoot, stdio: "inherit" });
    console.log("  ✓ Lab 2 schema successfully created.\n");

    // Step 4: Seed Lab 2 pre-existing data (RequesterUsers + Tickets)
    console.log("[Step 4/8] Inserting Lab 2 pre-existing data via raw SQL (RequesterUsers + Tickets)...");

    const catRes = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO "Category" ("name", "isActive") VALUES ('Hardware Legacy', true) RETURNING id;`
    );
    const catId = catRes[0].id;

    const sysRes = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO "RelatedSystem" ("name") VALUES ('Laptop Legacy') RETURNING id;`
    );
    const sysId = sysRes[0].id;

    // Insert 3 legacy requesters
    const req1 = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO "RequesterUser" ("name", "email", "isActive", "createdAt") 
       VALUES ('Alice Lab2', 'alice.lab2@example.com', true, NOW()) RETURNING id;`
    );
    const req2 = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO "RequesterUser" ("name", "email", "isActive", "createdAt") 
       VALUES ('Bob Lab2', 'bob.lab2@example.com', true, NOW()) RETURNING id;`
    );
    const req3 = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO "RequesterUser" ("name", "email", "isActive", "createdAt") 
       VALUES ('Charlie Lab2', 'charlie.lab2@example.com', true, NOW()) RETURNING id;`
    );

    const reqId1 = req1[0].id;
    const reqId2 = req2[0].id;
    const reqId3 = req3[0].id;

    // Insert 4 tickets across the requesters
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Ticket" ("ticketNumber", "requesterId", "categoryId", "relatedSystemId", "summary", "description", "requestedPriority", "currentStatus", "createdAt", "updatedAt") 
      VALUES 
        ('TKT-2026-000001', ${reqId1}, ${catId}, ${sysId}, 'Alice Laptop Issue', 'Screen flickering', 'HIGH'::"Priority", 'NEW'::"TicketStatus", NOW(), NOW()),
        ('TKT-2026-000002', ${reqId1}, ${catId}, ${sysId}, 'Alice Mouse Issue', 'Left click sticky', 'LOW'::"Priority", 'NEW'::"TicketStatus", NOW(), NOW()),
        ('TKT-2026-000003', ${reqId2}, ${catId}, ${sysId}, 'Bob VPN Issue', 'Cannot connect to VPN', 'MEDIUM'::"Priority", 'NEW'::"TicketStatus", NOW(), NOW()),
        ('TKT-2026-000004', ${reqId3}, ${catId}, ${sysId}, 'Charlie Wifi Issue', 'Wifi disconnects', 'HIGH'::"Priority", 'NEW'::"TicketStatus", NOW(), NOW());
    `);

    // Capture BEFORE migration mapping: { ticketNumber: requesterEmail }
    const beforeTicketsRaw = await prisma.$queryRawUnsafe<Array<{ ticketNumber: string; email: string }>>(`
      SELECT t."ticketNumber", r."email"
      FROM "Ticket" t
      JOIN "RequesterUser" r ON t."requesterId" = r."id"
      ORDER BY t."ticketNumber" ASC;
    `);

    const beforeMap = new Map<string, string>();
    for (const t of beforeTicketsRaw) {
      beforeMap.set(t.ticketNumber, t.email);
    }

    console.log(`  ✓ Inserted 3 RequesterUsers and 4 Tickets.`);
    console.log(`  ✓ Captured pre-migration ticket mapping (${beforeMap.size} tickets recorded).\n`);

    // Step 5: Restore ONLY Lab 3 migrations. Lab 4 migrations stay in tempDir
    // and will be returned to their proper place by the finally block.
    // This keeps Step 6 ("migrate deploy") limited to Lab 1-3 migrations,
    // which is exactly what MIG-06 tests.
    console.log("[Step 5/8] Restoring Lab 3 migrations (Lab 4 stays hidden)...");
    for (const folder of lab3MigrationFolders) {
      const src = path.join(tempDir, folder);
      const dest = path.join(migrationsDir, folder);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
      }
    }
    // Note: do NOT rmdirSync here — tempDir may still hold Lab 4 folder(s).
    console.log("  ✓ Lab 3 migrations restored.\n");

    // Step 6: Apply Lab 3 migrations (6-9) onto populated Lab 2 database
    console.log("[Step 6/8] Deploying Lab 3 migrations onto active Lab 2 database...");
    execSync("npx prisma migrate deploy", { cwd: serverRoot, stdio: "inherit" });
    console.log("  ✓ Lab 3 migrations applied cleanly without FK constraint violations.\n");

    // Step 7: Run User Data Migration (runUserMigration / prisma db seed)
    console.log("[Step 7/8] Running user migration and seed (runUserMigration)...");
    const migrationResult = await runUserMigration(prisma);
    console.log(`  ✓ Migrated Users Count: ${migrationResult.migratedUsersCount}`);
    console.log(`  ✓ Updated Tickets Count: ${migrationResult.updatedTicketsCount}\n`);

    // Step 8: Comprehensive Verification
    console.log("[Step 8/8] Verifying upgraded database integrity...");

    // 8a: Verify User record created
    const migratedUser = await prisma.user.findUnique({
      where: { email: "alice.lab2@example.com" },
    });
    if (!migratedUser) {
      throw new Error("VERIFICATION FAILED: Migrated user not found in User table.");
    }
    console.log("  ✓ User record present in User table.");
    if (migratedUser.role !== "REQUESTER") {
      throw new Error(`VERIFICATION FAILED: Expected role REQUESTER, got ${migratedUser.role}`);
    }
    if (!migratedUser.mustChangePassword) {
      throw new Error("VERIFICATION FAILED: mustChangePassword should be true.");
    }

    // 8b: Verify password hash matches MIGRATED_USER_INITIAL_PASSWORD (ChangeMe123!)
    const passOk = await comparePassword(MIGRATED_USER_INITIAL_PASSWORD, migratedUser.passwordHash);
    if (!passOk) {
      throw new Error("VERIFICATION FAILED: Initial password hash does not match MIGRATED_USER_INITIAL_PASSWORD");
    }
    console.log("  ✓ Password hash verified against MIGRATED_USER_INITIAL_PASSWORD ('ChangeMe123!').");

    // 8c: Compare Before vs After Ticket Ownership Matrix for ALL tickets
    console.log("\n  --- Ticket Ownership Migration Comparison Matrix ---");
    // Select only Lab 1-3 columns: the database is in the Lab 3 state here, and the generated
    // client would otherwise ask for the Lab 4 columns (version, resolvedAt, statusChangedAt).
    const afterTickets = await prisma.ticket.findMany({
      select: { ticketNumber: true, requester: { select: { email: true } } },
      orderBy: { ticketNumber: "asc" },
    });

    const afterMap = new Map<string, string>();
    for (const t of afterTickets) {
      afterMap.set(t.ticketNumber, t.requester.email);
    }

    let mismatchCount = 0;
    for (const [ticketNumber, beforeEmail] of beforeMap.entries()) {
      const afterEmail = afterMap.get(ticketNumber);
      const isMatch = afterEmail === beforeEmail;
      const symbol = isMatch ? "✓" : "❌";
      console.log(`  Ticket #${ticketNumber}: ${beforeEmail} -> ${afterEmail ?? "MISSING"} ${symbol}`);
      if (!isMatch) {
        mismatchCount++;
      }
    }

    if (mismatchCount > 0) {
      throw new Error(`VERIFICATION FAILED: ${mismatchCount} ticket(s) failed ownership migration matching!`);
    }
    console.log("  ✓ All Ticket ownership relations verified identical before and after migration.");

    // 8d: Verify FK Constraint in PostgreSQL system catalog
    const fkCheck = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count FROM information_schema.table_constraints 
      WHERE constraint_name = 'Ticket_requesterId_fkey' 
        AND table_name = 'Ticket'
        AND constraint_type = 'FOREIGN KEY'
    `;
    if (!fkCheck[0] || fkCheck[0].count === BigInt(0)) {
      throw new Error("VERIFICATION FAILED: Foreign key constraint 'Ticket_requesterId_fkey' does not exist in Postgres!");
    }
    console.log("  ✓ Foreign Key constraint 'Ticket_requesterId_fkey' confirmed present in Postgres schema catalog.\n");

    console.log("==================================================");
    console.log(" Upgrade Path Verification SUCCESSFUL! 🎉 ");
    console.log("==================================================");

  } catch (error) {
    console.error("\n❌ UPGRADE PATH TEST FAILED:", error);
    process.exitCode = 1;
  } finally {
    // Always restore ALL folders that were moved (Lab 3 + Lab 4) regardless
    // of whether the script succeeded or failed.
    if (fs.existsSync(tempDir)) {
      console.log("\n[Cleanup] Restoring all hidden migration folders...");
      const allHidden = fs.readdirSync(tempDir);
      for (const folder of allHidden) {
        const src = path.join(tempDir, folder);
        const dest = path.join(migrationsDir, folder);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.renameSync(src, dest);
          console.log(`  ✓ Restored: ${folder}`);
        }
      }
      try { fs.rmdirSync(tempDir); } catch { /* already empty or gone */ }
    }
    await prisma.$disconnect();
    console.log(
      "\n⚠️  WARNING: This script performed DROP SCHEMA on the dev database." +
      "\n   Run \"npm run db:reset\" from the server/ directory to restore the dev database.\n"
    );
  }
}

runUpgradePathTest();
