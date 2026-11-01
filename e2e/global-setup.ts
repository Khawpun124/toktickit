import { prepareLab4Seed } from "./lab-04/support/prepare";
import { execSync } from "child_process";

async function globalSetup() {
  console.log("\n[Playwright Global Setup] Resetting database...");
  execSync("npm run db:reset", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  console.log("[Playwright Global Setup] Database reset completed.\n");
  // Lab 4: change the seed users' first passwords once per run (e2e/lab-04/support/prepare.ts)
  await prepareLab4Seed();
}

export default globalSetup;
