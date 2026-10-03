import { execSync } from "child_process";

async function globalSetup() {
  console.log("\n[Playwright Global Setup] Resetting database...");
  execSync("npm run db:reset", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  console.log("[Playwright Global Setup] Database reset completed.\n");
}

export default globalSetup;
