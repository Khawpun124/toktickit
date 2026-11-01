BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. ActionStatus enum
--     Created inside a DO block so the statement is idempotent (pg_type check).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActionStatus') THEN
    CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. ActionTaken table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ActionTaken" (
    "id"               SERIAL         NOT NULL,
    "ticketId"         INTEGER        NOT NULL,
    "actionAt"         TIMESTAMP(3)   NOT NULL,
    "description"      TEXT           NOT NULL,
    "result"           TEXT,
    "performedById"    INTEGER        NOT NULL,
    "assigneeId"       INTEGER        NOT NULL,
    "status"           "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "followUpRequired" BOOLEAN        NOT NULL DEFAULT false,
    "followUpNote"     TEXT,
    "attachmentNotes"  TEXT,
    -- Idempotency key: stored for deduplication, never exposed in API responses.
    "clientRequestId"  TEXT,
    "version"          INTEGER        NOT NULL DEFAULT 1,
    "createdAt"        TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1c. Foreign keys for ActionTaken
--     Each wrapped in DO/EXCEPTION so the statement is safe to replay.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE "ActionTaken"
    ADD CONSTRAINT "ActionTaken_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "ActionTaken"
    ADD CONSTRAINT "ActionTaken_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "ActionTaken"
    ADD CONSTRAINT "ActionTaken_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1d. ActionTaken indexes
--     Idempotency unique: NULL clientRequestId values are excluded per SQL
--     standard (multiple NULLs allowed), so a creator can have many Actions
--     without a clientRequestId while the pair (performedById, non-null UUID)
--     remains unique.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "ActionTaken_performedById_clientRequestId_key"
  ON "ActionTaken"("performedById", "clientRequestId");

-- Stable ordered list: GET /api/tickets/:id/actions (createdAt ASC, id ASC)
CREATE INDEX IF NOT EXISTS "ActionTaken_ticketId_createdAt_id_idx"
  ON "ActionTaken"("ticketId", "createdAt", "id");

-- Resolution gate: count PLANNED / IN_PROGRESS Actions per Ticket
CREATE INDEX IF NOT EXISTS "ActionTaken_ticketId_status_idx"
  ON "ActionTaken"("ticketId", "status");

-- Staff dashboard — My open Actions (assigned to me, not yet terminal)
CREATE INDEX IF NOT EXISTS "ActionTaken_assigneeId_status_idx"
  ON "ActionTaken"("assigneeId", "status");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add new columns to Ticket (additive only — no existing columns are touched)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "version"         INTEGER      NOT NULL DEFAULT 1;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "resolvedAt"      TIMESTAMP(3);
-- statusChangedAt is added nullable first so we can backfill before NOT NULL.
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "statusChangedAt" TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lab 4 indexes on Ticket
--    The single-column indexes added in Labs 1-3 are kept as-is.
-- ─────────────────────────────────────────────────────────────────────────────
-- Dashboard counts and Requester drill-down: /tickets?requesterId=...&currentStatus=...
CREATE INDEX IF NOT EXISTS "Ticket_requesterId_currentStatus_idx"
  ON "Ticket"("requesterId", "currentStatus");

-- Staff drill-down: /staff/tickets?ticketOwnerId=...&currentStatus=...
CREATE INDEX IF NOT EXISTS "Ticket_ticketOwnerId_currentStatus_idx"
  ON "Ticket"("ticketOwnerId", "currentStatus");

-- Status-only filters (New, In Progress, Waiting for Requester counters)
CREATE INDEX IF NOT EXISTS "Ticket_currentStatus_idx"
  ON "Ticket"("currentStatus");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill, then finalise statusChangedAt
--    Every UPDATE is idempotent: a second run finds no NULL rows, changes 0.
-- ─────────────────────────────────────────────────────────────────────────────

-- resolvedAt: best available approximation — the updatedAt at the time the
-- Ticket was resolved or closed.  Tickets in other statuses keep NULL.
UPDATE "Ticket"
SET    "resolvedAt" = "updatedAt"
WHERE  "currentStatus" IN ('RESOLVED', 'CLOSED')
AND    "resolvedAt" IS NULL;

-- statusChangedAt: best available approximation for all pre-Lab-4 Tickets.
-- Exact for every Ticket that changes status after this migration (BR-39).
UPDATE "Ticket"
SET    "statusChangedAt" = "updatedAt"
WHERE  "statusChangedAt" IS NULL;

ALTER TABLE "Ticket" ALTER COLUMN "statusChangedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Ticket" ALTER COLUMN "statusChangedAt" SET NOT NULL;

COMMIT;
