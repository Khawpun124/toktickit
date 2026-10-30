#!/usr/bin/env tsx
/**
 * db:backup — Dumps the current database to backups/lab3-before-lab4-<UTC>.sql
 * via pg_dump running inside the Postgres container.
 *
 * Usage (from repo root):  npm run db:backup --prefix server
 * Run BEFORE applying the Lab 4 migration.
 *
 * Passwords are read from the container's environment variables (POSTGRES_USER,
 * POSTGRES_PASSWORD, POSTGRES_DB) and never appear in this process's command line
 * or output.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");

const utcTag = new Date().toISOString().replace(/[:.]/g, "-");
const backupsDir = path.join(serverRoot, "backups");
fs.mkdirSync(backupsDir, { recursive: true });

const outFile = path.join(backupsDir, `lab3-before-lab4-${utcTag}.sql`);
const relPath = path.relative(process.cwd(), outFile);

console.log(`[db:backup] Starting pg_dump → ${relPath}`);
console.log(`[db:backup] Command: docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'`);

// Pass as an args array so the host shell never interpolates the command.
// Inside the container, sh expands $POSTGRES_PASSWORD, $POSTGRES_USER, and
// $POSTGRES_DB from the container's own environment (set by docker-compose.yml).
const result = spawnSync(
  "docker",
  [
    "compose", "exec", "-T", "postgres",
    "sh", "-c",
    'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"',
  ],
  { cwd: repoRoot, encoding: "buffer" }
);

if (result.error) {
  console.error("[db:backup] Failed to spawn docker:", result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  const stderr = (result.stderr ?? Buffer.alloc(0)).toString("utf-8");
  console.error("[db:backup] pg_dump exited with code", result.status);
  // Scrub any accidental password leak from error text
  console.error(stderr.replace(/PGPASSWORD=\S+/g, "PGPASSWORD=***"));
  process.exit(1);
}

fs.writeFileSync(outFile, result.stdout);
const kb = ((result.stdout as Buffer).length / 1024).toFixed(1);
console.log(`[db:backup] ✓ Done — ${kb} KB written to ${outFile}`);
console.log(`[db:backup] Keep this file path for Option B restore:`);
console.log(`            ${outFile}`);
