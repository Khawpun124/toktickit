import { getPrisma } from "../src/prisma.js";

async function resetDb() {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE;`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA public;`);
  await prisma.$disconnect();
  console.log("Database schema reset cleanly.");
}

resetDb();
