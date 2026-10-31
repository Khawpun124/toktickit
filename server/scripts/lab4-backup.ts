#!/usr/bin/env tsx
/**
 * db:backup — Dumps the current database to backups/lab3-before-lab4-<UTC>.sql
 * via pg_dump running inside the Postgres container.
 *
 * Usage (from repo root):  npm run db:backup --prefix server
 * Run BEFORE applying the Lab 4 migration.
 *
 * The user and database come from the container's own POSTGRES_USER and POSTGRES_DB,
 * expanded by sh inside the container, so no credential appears on this machine's
 * command line or in the output. pg_dump's stdout is streamed straight into the file.
 *
 * Before dumping, the script reads the container's POSTGRES_DB and compares it with the
 * database named in DATABASE_URL (which the other Lab 4 scripts act on). If the two
 * differ, it stops with a non-zero exit and writes no file.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { repoRoot, resolveTarget, serverRoot } from "./lib/lab4-db.js";

function fail(message: string, detail?: string): never {
  console.error(`[db:backup] ✗ ${message}`);
  if (detail?.trim()) console.error(detail.trim());
  process.exit(1);
}

let urlDb: string;
try {
  urlDb = resolveTarget("db:backup").dbName;
} catch (e) {
  fail((e as Error).message);
}

// The database pg_dump will actually read: the container's POSTGRES_DB.
const probe = spawnSync(
  "docker",
  ["compose", "exec", "-T", "postgres", "sh", "-c", 'printf "%s" "$POSTGRES_DB"'],
  { cwd: repoRoot, encoding: "utf-8" }
);
if (probe.error) fail(`Failed to spawn docker: ${probe.error.message}`);
if (probe.status !== 0) fail(`Could not read POSTGRES_DB from the container (exit ${probe.status})`, probe.stderr);
const containerDb = probe.stdout.trim();
if (!containerDb) fail("POSTGRES_DB is empty inside the container");

console.log(`[db:backup] Database to back up (container POSTGRES_DB): ${containerDb}`);
if (containerDb !== urlDb) {
  fail(
    `Database mismatch: the container's POSTGRES_DB is "${containerDb}" but DATABASE_URL names "${urlDb}". ` +
    `The backup would not cover the database the Lab 4 migration and rollback act on. Nothing was written.`
  );
}

const utcTag = new Date().toISOString().replace(/[:.]/g, "-");
const backupsDir = path.join(serverRoot, "backups");
fs.mkdirSync(backupsDir, { recursive: true });

const outFile = path.join(backupsDir, `lab3-before-lab4-${utcTag}.sql`);
const relPath = path.relative(process.cwd(), outFile);

console.log(`[db:backup] Starting pg_dump → ${relPath}`);
console.log(`[db:backup] Command: docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'`);

// Passed as an args array so the host shell never interpolates the command.
const fd = fs.openSync(outFile, "w");
let result;
try {
  result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "sh", "-c", 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'],
    { cwd: repoRoot, stdio: ["ignore", fd, "pipe"], encoding: "utf-8" }
  );
} finally {
  fs.closeSync(fd);
}

function failAndRemove(message: string, detail?: string): never {
  fs.rmSync(outFile, { force: true });
  fail(`${message} (partial file removed)`, detail);
}

if (result.error) failAndRemove(`Failed to spawn docker: ${result.error.message}`);
if (result.status !== 0) failAndRemove(`pg_dump exited with code ${result.status}`, result.stderr);

const bytes = fs.statSync(outFile).size;
if (bytes === 0) failAndRemove("pg_dump produced an empty file", result.stderr);

console.log(`[db:backup] ✓ Done — ${(bytes / 1024).toFixed(1)} KB of ${containerDb} written to ${outFile}`);
console.log(`[db:backup] Keep this file path for Option B restore:`);
console.log(`            ${outFile}`);
