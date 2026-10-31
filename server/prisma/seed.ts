import { getPrisma } from "../src/prisma.js";
import { Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";
import { runUserMigration } from "../src/utils/migrate-users.js";
import { MIGRATED_USER_INITIAL_PASSWORD } from "../src/constants.js";
import { seedLab4 } from "./seed-lab4.js";

async function main() {
  const prisma = getPrisma();

  // Run user migration for existing RequesterUser records
  await runUserMigration(prisma);

  const categories = [
    "Account and Access",
    "Hardware",
    "Software",
    "Network",
  ];

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const relatedSystems = [
    "Email",
    "Campus Wi-Fi",
    "VPN",
    "LEB2 App",
    "Grade Submission App",
    "Printer",
    "Corporate Laptop",
  ];

  for (const name of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const defaultPasswordHash = await hashPassword(MIGRATED_USER_INITIAL_PASSWORD);

  const usersToSeed = [
    // --- Requesters ---
    // jennifer.anderson: Lab 2 E2E (requester-ticket-flow.spec.ts L102,161,210)
    //                    Lab 3 E2E (staff-ticket-flow.spec.ts L98,246) — Requester whose ticket Staff manages
    { name: "Jennifer Anderson", email: "jennifer.anderson@example.com", role: Role.REQUESTER, isActive: true },
    // emily.taylor: Lab 2 E2E (requester-ticket-flow.spec.ts L164,182) — second Requester
    { name: "Emily Taylor", email: "emily.taylor@example.com", role: Role.REQUESTER, isActive: true },
    // michael.brown: Lab 3 E2E authentication.spec.ts — tablet project login flow
    { name: "Michael Brown", email: "michael.brown@example.com", role: Role.REQUESTER, isActive: true },
    // sarah.connor: Lab 3 E2E authentication.spec.ts — desktop project login flow
    { name: "Sarah Connor", email: "sarah.connor@example.com", role: Role.REQUESTER, isActive: true },
    // david.miller: Lab 3 E2E authentication.spec.ts — mobile project login flow
    { name: "David Miller", email: "david.miller@example.com", role: Role.REQUESTER, isActive: true },
    // 1+ Inactive Requester (not used in E2E; exists to satisfy Lab 1-2 requirements)
    { name: "Inactive Tester", email: "inactive.tester@example.com", role: Role.REQUESTER, isActive: false },
    // --- IT Staff ---
    // alex.staff: Lab 3 E2E staff-ticket-flow.spec.ts L99,225,247 — primary IT Staff actor
    { name: "Alex Staff", email: "alex.staff@tiktockit.com", role: Role.IT_STAFF, isActive: true },
    { name: "Ben Staff", email: "ben.staff@tiktockit.com", role: Role.IT_STAFF, isActive: true },
    { name: "Clara Staff", email: "clara.staff@tiktockit.com", role: Role.IT_STAFF, isActive: true },
    // 1+ Inactive IT Staff (not used in E2E)
    { name: "Retired Staff", email: "retired.staff@tiktockit.com", role: Role.IT_STAFF, isActive: false },
    // --- Administrator ---
    // admin@tiktockit.com: Lab 3 E2E user-administration.spec.ts L69,110,114
    { name: "Admin User", email: "admin@tiktockit.com", role: Role.ADMINISTRATOR, isActive: true },
  ];

  for (const u of usersToSeed) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        passwordHash: defaultPasswordHash,
        mustChangePassword: true,
      },
      create: {
        name: u.name,
        email: u.email,
        passwordHash: defaultPasswordHash,
        role: u.role,
        isActive: u.isActive,
        mustChangePassword: true,
      },
    });
  }

  // Lab 4: dedicated users and Tickets with Actions Taken (see prisma/seed-lab4.ts).
  // Runs after the Lab 1-3 users so those keep the lowest ids.
  await seedLab4(prisma, defaultPasswordHash);

  console.log("Seeding categories, users, and related systems completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });


