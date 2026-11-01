-- lab4_down.sql — Reverse of migration 20261030045000_add_actions_taken_and_workflow_fields
--
-- IMPORTANT: Run through db:rollback:lab4 which exports ActionTaken rows first.
--   npm run db:rollback:lab4 --prefix server -- --confirm
--
-- This script can also be run manually after a full backup restore (Option B).
-- It is idempotent: DROP IF EXISTS / DROP COLUMN IF EXISTS mean a second run
-- is safe.

BEGIN;

-- 1. Drop ActionTaken table.
--    Its indexes (ActionTaken_*_idx / ActionTaken_pkey) and foreign-key
--    constraints are automatically removed with the table.
DROP TABLE IF EXISTS "ActionTaken";

-- 2. Drop ActionStatus enum.
DROP TYPE IF EXISTS "ActionStatus";

-- 3. Drop Lab 4 composite indexes on Ticket.
--    The original single-column indexes (requesterId_idx, ticketOwnerId_idx)
--    are NOT dropped — they belong to the Lab 1-3 schema.
DROP INDEX IF EXISTS "Ticket_requesterId_currentStatus_idx";
DROP INDEX IF EXISTS "Ticket_ticketOwnerId_currentStatus_idx";
DROP INDEX IF EXISTS "Ticket_currentStatus_idx";

-- 4. Remove the three Lab 4 columns from Ticket.
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "version";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "resolvedAt";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "statusChangedAt";

-- 5. Remove the Lab 4 migration record from Prisma's history so the
--    migration can be applied again cleanly.
DELETE FROM "_prisma_migrations"
WHERE migration_name LIKE '%_add_actions_taken_and_workflow_fields';

COMMIT;
