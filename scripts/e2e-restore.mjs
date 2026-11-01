// npm run test:e2e:clean
//
// Runs the Playwright suite, then always runs `git restore artifacts/`, because the Lab 2 and Lab 3
// specs rewrite the committed screenshots in artifacts/ on every run. The restore also runs when
// tests fail. The script exits with Playwright's own exit code, so CI-style checks still see a
// failure. Extra arguments are passed to Playwright, for example:
//   npm run test:e2e:clean -- --project=desktop
//
// `npm run test:e2e` (plain `playwright test`, used by CI) is unchanged.

import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";

function run(command, args) {
  // On Windows, npx is npx.cmd, and Node only starts .cmd files through a shell.
  const result = spawnSync(isWindows ? `${command}.cmd` : command, args, { stdio: "inherit", shell: isWindows });
  if (result.error) {
    console.error(`[e2e-restore] Could not start ${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

const playwrightExit = run("npx", ["playwright", "test", ...process.argv.slice(2)]);

console.log("\n[e2e-restore] Restoring the committed screenshots: git restore artifacts/");
const gitResult = spawnSync("git", ["restore", "artifacts/"], { stdio: "inherit" });
if (gitResult.error || gitResult.status !== 0) {
  console.error("[e2e-restore] git restore artifacts/ failed; run it by hand before committing.");
}

console.log(`[e2e-restore] Playwright exit code: ${playwrightExit}`);
process.exit(playwrightExit);
