import { getPrisma } from "../src/prisma.js";
import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import { runUserMigration } from "../src/utils/migrate-users.js";

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

  const defaultPasswordHash = await bcrypt.hash("ChangeMe123!", 10);

  const usersToSeed = [
    // 4+ Active Requesters
    { name: "Jennifer Anderson", email: "jennifer.anderson@example.com", role: Role.REQUESTER, isActive: true },
    { name: "Michael Brown", email: "michael.brown@example.com", role: Role.REQUESTER, isActive: true },
    { name: "Sarah Connor", email: "sarah.connor@example.com", role: Role.REQUESTER, isActive: true },
    { name: "David Miller", email: "david.miller@example.com", role: Role.REQUESTER, isActive: true },
    // 1+ Inactive Requester
    { name: "Inactive Tester", email: "inactive.tester@example.com", role: Role.REQUESTER, isActive: false },
    // 3+ Active IT Staff
    { name: "Alex Staff", email: "alex.staff@tiktockit.com", role: Role.IT_STAFF, isActive: true },
    { name: "Ben Staff", email: "ben.staff@tiktockit.com", role: Role.IT_STAFF, isActive: true },
    { name: "Clara Staff", email: "clara.staff@tiktockit.com", role: Role.IT_STAFF, isActive: true },
    // 1+ Inactive IT Staff
    { name: "Retired Staff", email: "retired.staff@tiktockit.com", role: Role.IT_STAFF, isActive: false },
    // 1+ Active Administrator
    { name: "Admin User", email: "admin@tiktockit.com", role: Role.ADMINISTRATOR, isActive: true },
  ];

  for (const u of usersToSeed) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, isActive: u.isActive },
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


