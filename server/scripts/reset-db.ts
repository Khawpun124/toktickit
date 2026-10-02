import { getPrisma } from "../src/prisma.js";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");

async function resetDb() {
  const prisma = getPrisma();
  console.log("Resetting database schema...");
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE;`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA public;`);
  await prisma.$disconnect();

  console.log("Running migrations...");
  execSync("npx prisma migrate deploy", {
    cwd: serverRoot,
    stdio: "inherit",
    env: process.env,
  });

  console.log("Running seed...");
  execSync("npx prisma db seed", {
    cwd: serverRoot,
    stdio: "inherit",
    env: process.env,
  });

  console.log("Database reset completed successfully.");
}

resetDb().catch((err) => {
  console.error("Database reset failed:", err);
  process.exit(1);
});
