# Issue 2 rehearsal: Lab 3 real data → Lab 4 upgrade → rollback

End-to-end rehearsal requested in the PR review: migration and rollback on a Lab 3 database that
holds data created through the Lab 3 application, plus live HTTP checks of stale updates, replay
idempotency, and authorization.

## Summary

| Review item | Commands run | Main result | Evidence in this file |
|---|---|---|---|
| 1. Migration on a Lab 3 database with data | Lab 3 app: `lab3-real-data.ts --mode populate`; Lab 4: `db:backup`, `db:snapshot`, `prisma migrate deploy`, `db:verify:lab4 --at-upgrade`, `db:backfill:lab4`, MIG-02 SQL, `--mode capture` | Data from the Lab 3 HTTP API: 15 users, 28 Tickets in all 8 statuses, 12 comments, 9 notes, 7 attachments (2 removed). Verify 26 checks, 0 failures; backfill 0 rows; MIG-02 28/28 Tickets, 0 bad; 34 Lab 3 GET responses byte-identical before and after (sha256 `a4b486b8…c34e8512`) | Steps 1, 2 |
| 2. Rollback and snapshot (Lab 1-3 unchanged after rollback and after restore) | `db:rollback:lab4 -- --confirm`; `db:verify:lab4 --after-rollback` with the step 2 snapshot; README Option B (DROP SCHEMA + restore of the step 2 backup) then the same verify; `--mode capture` on the Lab 3 app; `--mode smoke`; upgrade again with verify | Export rowCount 117 = 117 rows in the database, sorted ids identical. After Option A and after Option B: verify 24 checks, 0 failures, row counts and per-row checksums of all 8 Lab 1-3 tables match the snapshot, captures byte-identical (`a4b486b8…c34e8512`). Lab 3 write smoke 11/11 steps pass. Every later upgrade: verify 26 checks, 0 failures | Steps 4, 5 |
| 3. statusChangedAt (BR-39) | `lab4-live-check.ts --mode status-changed-at`, 2 rounds | 14/14 steps pass in each round. It equals createdAt (0 ms) at creation and keeps every digit through 8 non-status steps (comment, note, owner, IT priority, Action create, edit and status, a refused transition 400), while updatedAt changes at owner and priority. It is later after each of 5 transitions, and re-entering WAITING is later than the first WAITING | Step 5b |
| 4. Concurrency and authorization | `lab4-live-check.ts`, 5 rounds (3 in step 3, 1 in step 5, 1 in step 5b) | Every round: 20 parallel creates with one clientRequestId → 201 x1, 200 x19, one id, 1 row; 20 distinct → 201 x20, +20 rows; 20 parallel edits → 200 x1, 409 STALE_VERSION x19, version +1, stored text = winner; 10 parallel status changes → 200 x1, 409 x9. Authorization: 7 callers (no session, owner Requester, other Requester, IT Staff, Administrator, must change password, deactivated) x 4 endpoints = 28/28 match api-spec section 11; the deactivated user's old session gets 401 everywhere; refused writes changed 0 of 10 Actions; another Requester's Ticket and a missing Ticket give byte-identical 404s | Steps 3, 5, 5b |
| 5. Test suites | `npx vitest run` in `server/` on the freshly reset database; `npx vitest run` in `client/` | Server: 25 files, 233/233 tests pass. Client: first run 10/11 files, 47/48 tests (one test in `tests/lab-01/App.test.tsx` failed; its error text was not kept); that file passes 4/4 alone and a second full run passes 11/11 files, 48/48 tests | Step 6, final run |

- Database: `toktickit_db` in container `toktickit-db` (the dev database; its data was disposable).
  No other container or database was touched.
- Lab 3 code: `origin/main` = `1396d2ebd4362c1bafd44b7d0a3d3e64879ee976`, checked out as a detached
  worktree at `../toktickit-lab3-release` (outside the repository).
- Lab 4 code: branch `feature/2-lab4-actions-taken-foundation` = `3b3648880666163e9c5585ef60660e9fbc4f00ef`
  plus the two new scripts in this rehearsal (`server/scripts/lab3-real-data.ts`,
  `server/scripts/lab4-live-check.ts`).
- Ports: Lab 3 app on 3300 (run from the worktree), Lab 4 app on 3400 (run from the repository).
- Secrets: `DATABASE_URL` was read from `server/.env` into the environment of each command and never
  printed. The new passwords come from `REHEARSAL_PASSWORD` (a random value kept in a temp folder outside
  the repository). Capture files, the state file (ids only), and the stale session of the deactivated
  user live in that temp folder too. This file holds no URL, password, hash, cookie, or session id.

## Step 0. Lab 3 release worktree

```
$ git worktree add --detach ../toktickit-lab3-release origin/main
HEAD is now at 1396d2e Update ai-use.md
$ ls server/prisma/migrations        # in the worktree
20260813155606_add_category_model ... 20260917155038_restore_ticket_requester_fk   (9 folders, no Lab 4 migration)
$ test -e server/src/routes/actions.ts || echo "no src/routes/actions.ts"
no src/routes/actions.ts
$ npm ci && npx prisma generate      # in the worktree; git status stays empty
```

`git diff origin/main..HEAD -- server/src/app.ts` shows only two changes: `statusChangedAt` in the
ticket status handler and the Actions router mount. No Lab 3 GET handler changed, so the Lab 3 GET
responses must be byte-identical before and after the upgrade.

## Step 1. Lab 3 state with real data

```
$ (worktree/server) npm run db:reset           # target printed first: toktickit_db
All migrations have been successfully applied.            (9 migrations)
Seeding categories, users, and related systems completed successfully.
Database reset completed successfully.

$ (worktree/server) PORT=3300 npx tsx src/index.ts
TokTickIT API listening on http://localhost:3300

$ npx tsx scripts/lab3-real-data.ts --base http://localhost:3300 --mode populate
seed users logged in and changed password: 8
admin created users: 4 (rh.pending never logs in)
tickets: 28 { NEW: 4, OPEN: 3, IN_PROGRESS: 5, WAITING_FOR_REQUESTER: 3, RESOLVED: 3, CLOSED: 3, REOPENED: 3, CANCELLED: 4 }
comments: 12, internal notes: 9, attachments: 7 (removed with a reason: 2), resolution flags: 2
rh.leaver deactivated; its old session now gives 401 on /api/auth/me
state written (ids only): state.json

$ npx tsx scripts/lab3-real-data.ts --base http://localhost:3300 --mode capture --out capture-before.json
captured 34 responses -> capture-before.json
statuses: 200, 404
sha256(file) = a4b486b89b6b309d5ab54aa236d7c5c492330dc5750cb9efff4ab479c34e8512

$ ... --mode capture --out capture-before-repeat.json && cmp capture-before.json capture-before-repeat.json
sha256(file) = a4b486b89b6b309d5ab54aa236d7c5c492330dc5750cb9efff4ab479c34e8512
repeat capture IDENTICAL          (the capture itself is deterministic)
```

All data was written through the Lab 3 HTTP API (login, change-password, admin users, create
Ticket, owner, priority, status, comments, notes, attachment upload and removal with a reason,
resolution flag, deactivate). Every write waits 6 ms so `createdAt`/`uploadedAt` never tie, and
capture fails if a list ordered only by a timestamp has a tie. Capture keeps status, content-type,
and the raw body; it drops `Date`, `Set-Cookie`, `Connection`, `Keep-Alive`, and `ETag`, which
change per request (ETag only repeats the body hash). Stored timestamps stay in the body, so the
comparison also proves that `updatedAt` is never rewritten.

Captured: my tickets of 2 Requesters (2 sort orders), staff queue (all, unassigned, RESOLVED),
staff detail + comments + notes + attachments of T08, T10, T19 (CLOSED), T24 (REOPENED, note by the
deactivated user), T27 (CANCELLED), the owners' own detail of 2 Tickets, another Requester's Ticket
(404), admin users, staff users, categories, related systems.

Row counts after populate (`psql -d toktickit_db`):

```
 Category 4 | RelatedSystem 7 | RequesterUser 0 | User 15 | Session 19 | Ticket 28
 Attachment 7 (2 removed with a reason) | PublicComment 12 | InternalNote 9 | _prisma_migrations 9

 status: NEW 4, OPEN 3, IN_PROGRESS 5, WAITING_FOR_REQUESTER 3, RESOLVED 3, CLOSED 3, REOPENED 3, CANCELLED 4
 requested priority x IT priority: every requested priority has none/LOW/MEDIUM/HIGH; IT priority none = 7
 owner: 16 with an owner, 12 without

 role          | isActive | mustChangePassword | count
 REQUESTER     | f        | t                  | 1      inactive.tester (seed)
 REQUESTER     | t        | f                  | 5      jennifer, emily, michael, sarah, rh.requester
 REQUESTER     | t        | t                  | 2      david.miller (seed, unused), rh.pending (never logged in)
 IT_STAFF      | f        | f                  | 1      rh.leaver (deactivated by admin)
 IT_STAFF      | f        | t                  | 1      retired.staff (seed)
 IT_STAFF      | t        | f                  | 4      alex, ben, clara, rh.staff
 ADMINISTRATOR | t        | f                  | 1      admin
```

Note: stopping the background task did not stop the `node` child on Windows; the process holding
port 3300 was checked (it was the worktree's `tsx src/index.ts`) and stopped, and the port verified free.

## Step 2. Upgrade, following the README word for word (Lab 4 code, from the repository root)

Every README command ran as written; no README change was needed.

```
$ npm run db:backup --prefix server
[db:backup] Target database: toktickit_db
[db:backup] Database to back up (container POSTGRES_DB): toktickit_db
[db:backup] ✓ Done — 36.3 KB of toktickit_db written to ...\server\backups\lab3-before-lab4-2026-10-31T03-46-14-578Z.sql

$ npm run db:snapshot --prefix server
  Category 4 | RequesterUser 0 | RelatedSystem 7 | User 15 | Ticket 28 | Attachment 7 | PublicComment 12 | InternalNote 9
SNAPSHOT_FILE=...\server\backups\snapshot-2026-10-31T03-46-21-634Z.json

$ cd server && npx prisma migrate deploy
Datasource "db": PostgreSQL database "toktickit_db", schema "public"
10 migrations found in prisma/migrations
Applying migration `20261030045000_add_actions_taken_and_workflow_fields`
All migrations have been successfully applied.

$ npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-2026-10-31T03-46-21-634Z.json --at-upgrade
[db:verify:lab4] Results (26 checks, 0 failure(s))
  row counts and per-row checksums of all 8 Lab 1-3 tables: all match
  ActionTaken exists, 0 rows | all version = 1 | RESOLVED/CLOSED resolvedAt = updatedAt | others resolvedAt NULL
  no statusChangedAt NULL | all statusChangedAt = updatedAt
[db:verify:lab4] ✓ All checks passed

$ npm run db:backfill:lab4 --prefix server
  resolvedAt backfill:       0 row(s) updated
  statusChangedAt backfill:  0 row(s) updated
```

MIG-02 for every Ticket (`psql -d toktickit_db`; `resolved_ok` = `resolvedAt = updatedAt` for
RESOLVED/CLOSED, `resolvedAt IS NULL` otherwise):

```
  ticketNumber   |        status         | version | resolved_ok |  resolvedAt  | sca_eq_updated |  updatedAt
 TKT-2026-000001 | NEW                   |       1 | true        |              | t              | 03:44:48.830
 TKT-2026-000002 | NEW                   |       1 | true        |              | t              | 03:44:49.699
 TKT-2026-000003 | NEW                   |       1 | true        |              | t              | 03:44:48.893
 TKT-2026-000004 | NEW                   |       1 | true        |              | t              | 03:44:48.924
 TKT-2026-000005 | OPEN                  |       1 | true        |              | t              | 03:44:49.795
 TKT-2026-000006 | OPEN                  |       1 | true        |              | t              | 03:44:49.826
 TKT-2026-000007 | OPEN                  |       1 | true        |              | t              | 03:44:49.917
 TKT-2026-000008 | IN_PROGRESS           |       1 | true        |              | t              | 03:44:50.070
 TKT-2026-000009 | IN_PROGRESS           |       1 | true        |              | t              | 03:44:50.226
 TKT-2026-000010 | IN_PROGRESS           |       1 | true        |              | t              | 03:44:50.349
 TKT-2026-000011 | IN_PROGRESS           |       1 | true        |              | t              | 03:44:50.473
 TKT-2026-000012 | IN_PROGRESS           |       1 | true        |              | t              | 03:44:50.722
 TKT-2026-000013 | WAITING_FOR_REQUESTER |       1 | true        |              | t              | 03:44:54.048
 TKT-2026-000014 | WAITING_FOR_REQUESTER |       1 | true        |              | t              | 03:44:51.060
 TKT-2026-000015 | WAITING_FOR_REQUESTER |       1 | true        |              | t              | 03:44:51.216
 TKT-2026-000016 | RESOLVED              |       1 | true        | 03:44:51.371 | t              | 03:44:51.371
 TKT-2026-000017 | RESOLVED              |       1 | true        | 03:44:51.516 | t              | 03:44:51.516
 TKT-2026-000018 | RESOLVED              |       1 | true        | 03:44:54.077 | t              | 03:44:54.077
 TKT-2026-000019 | CLOSED                |       1 | true        | 03:44:51.851 | t              | 03:44:51.851
 TKT-2026-000020 | CLOSED                |       1 | true        | 03:44:52.006 | t              | 03:44:52.006
 TKT-2026-000021 | CLOSED                |       1 | true        | 03:44:52.221 | t              | 03:44:52.221
 TKT-2026-000022 | REOPENED              |       1 | true        |              | t              | 03:44:52.408
 TKT-2026-000023 | REOPENED              |       1 | true        |              | t              | 03:44:52.562
 TKT-2026-000024 | REOPENED              |       1 | true        |              | t              | 03:44:52.776
 TKT-2026-000025 | CANCELLED             |       1 | true        |              | t              | 03:44:52.807
 TKT-2026-000026 | CANCELLED             |       1 | true        |              | t              | 03:44:52.868
 TKT-2026-000027 | CANCELLED             |       1 | true        |              | t              | 03:44:53.025
 TKT-2026-000028 | CANCELLED             |       1 | true        |              | t              | 03:44:53.056
 total 28 | bad_version 0 | bad_resolved 0 | bad_unresolved 0 | bad_sca 0
```

Observation (the documented approximation, not a failure): TKT-2026-000018 was resolved and then
got the Requester's resolution flag, which updates `updatedAt` in Lab 3. Its backfilled
`resolvedAt` (03:44:54.077) is therefore the time of the flag, not of the resolution. The migration
calls this value the "best available approximation".

Lab 4 app (`PORT=3400 npx tsx src/index.ts` in the repository's `server/`), capture "after":

```
$ npx tsx scripts/lab3-real-data.ts --base http://localhost:3400 --mode capture --out capture-after-upgrade.json
captured 34 responses -> capture-after-upgrade.json
sha256(file) = a4b486b89b6b309d5ab54aa236d7c5c492330dc5750cb9efff4ab479c34e8512
$ cmp capture-before.json capture-after-upgrade.json && echo IDENTICAL
before vs after-upgrade: IDENTICAL
```

## Step 3. Live concurrency and authorization checks (Lab 4 app on 3400)

`server/scripts/lab4-live-check.ts` calls the running server with `fetch`, using the real users
and Ticket TKT-2026-000008 (IN_PROGRESS, Requester jennifer). It writes only Actions Taken (HTTP)
and Session rows (logging in); the database is only read, to count rows and confirm stored values.
Three rounds, each one run of the script, all exit 0:

| Check | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| (a) 20 parallel POST, one clientRequestId | 201 x1, 200 x19, one id (1), 1 row, +1 | 201 x1, 200 x19, one id (49), 1 row, +1 | 201 x1, 200 x19, one id (90), 1 row, +1 |
| (b) 20 parallel POST, different ids | 201 x20, 20 distinct, +20 | 201 x20, 20 distinct, +20 | 201 x20, 20 distinct, +20 |
| (c) 20 parallel PATCH edit, same expectedVersion | 200 x1, 409 STALE_VERSION x19, v1→2, stored = writer 8 | 200 x1, 409 STALE_VERSION x19, v1→2, stored = writer 7 | 200 x1, 409 STALE_VERSION x19, v1→2, stored = writer 2 |
| (d) 10 parallel PATCH status → COMPLETED | 200 x1, 409 ACTION_TERMINAL x9, COMPLETED v2 | same | same |
| (e) 7 callers x 4 endpoints vs contract | 28/28, refused writes changed 0 of 10 | 28/28, 0 of 10 | 28/28, 0 of 10 |
| (f) other Requester's Ticket vs missing Ticket | byte-identical 404 (actions list and Lab 3 detail) | same | same |
| Ticket row (updatedAt, version, statusChangedAt, status) | unchanged | unchanged | unchanged |
| Actions on the Ticket after the round | 39 | 78 | 117 |

In (d) the nine losers get `409 ACTION_TERMINAL`, not `STALE_VERSION`: they wait on the row lock,
then see the winner's COMPLETED state, and the terminal check comes before the version check in
api-spec section 0. This matches the contract.

(e) and (f) from round 1 (the same in rounds 2 and 3); the table columns are realigned for reading and
the two rows whose 4 cells are identical are collapsed, the values are as printed:

```
  caller                 | GET actions            | POST actions           | PATCH :actionId        | PATCH status
  no session             | ok 401 UNAUTHENTICATED | ok 401 UNAUTHENTICATED | ok 401 UNAUTHENTICATED | ok 401 UNAUTHENTICATED
  Requester (owner)      | ok 200                 | ok 403 FORBIDDEN       | ok 403 FORBIDDEN       | ok 403 FORBIDDEN
  Requester (not owner)  | ok 404 NOT_FOUND       | ok 403 FORBIDDEN       | ok 403 FORBIDDEN       | ok 403 FORBIDDEN
  IT Staff               | ok 200                 | ok 201                 | ok 200                 | ok 200
  Administrator          | ok 200                 | ok 201                 | ok 200                 | ok 200
  must change password   | ok 403 PASSWORD_CHANGE_REQUIRED on all 4
  deactivated            | ok 401 UNAUTHENTICATED on all 4 (session created before the admin deactivated the user)
  PASS  (e) every cell matches api-spec section 11: 7 callers x 4 endpoints
  PASS  (e) refused edits and status changes wrote nothing: 10 target Actions, 0 changed
(f) another Requester's Ticket 8 vs missing Ticket 1028, as rh.requester@example.com
  PASS  (f) actions list: 404 {"error":"Ticket not found","code":"NOT_FOUND"} | 404 {"error":"Ticket not found","code":"NOT_FOUND"}
  PASS  (f) Lab 3 ticket detail: 404 {"error":"Ticket not found"} | 404 {"error":"Ticket not found"}
```

After the three rounds `ActionTaken` holds 117 rows (63 distinct clientRequestIds, 54 without one).
A new capture on the Lab 4 app is still byte-identical to "before" (sha256 `a4b486b8…c34e8512`), so
the Actions work did not change any Lab 3 response.

## Step 4. Rollback Option A on the database with real Actions

The Lab 4 app was stopped first (README "Stop the application") and port 3400 confirmed free.

```
$ psql -d toktickit_db -c 'SELECT current_database(), count(*), min(id), max(id) FROM "ActionTaken"'
toktickit_db|117|1|129
$ psql ... 'SELECT id FROM "ActionTaken" ORDER BY id' > ids-db.txt
db ids: 117 lines, sha256 d2c38c5c0c59c437…
```

The ids have gaps (117 rows, max 129): concurrent creates in (a) that lost the unique-key race had
already taken a sequence value. No row is missing; the export below holds the same 117 ids.

```
$ npm run db:rollback:lab4 --prefix server -- --confirm        # target printed first: toktickit_db
[db:rollback:lab4] ActionTaken rows that will be removed from toktickit_db: 117
[db:rollback:lab4] ✓ Exported 117 row(s) to ...\server\backups\actions-taken-export-2026-10-31T03-54-16-903Z.json
[db:rollback:lab4] Executing server\prisma\rollback\lab4_down.sql on toktickit_db ...
BEGIN | DROP TABLE | DROP TYPE | DROP INDEX x3 | ALTER TABLE x3 | DELETE 1 | COMMIT
[db:rollback:lab4] ✓ Rollback complete on toktickit_db.

$ node: rowCount and sorted ids of the export (contents not shown)
export top-level keys: exportedAt, database, tablePresent, rowCount | rows.length 117 | rowCount 117
export ids: 117 lines, sha256 d2c38c5c0c59c437…
$ cmp ids-db.txt ids-export.txt
sorted id lists IDENTICAL (db before rollback vs export)

$ npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-2026-10-31T03-46-21-634Z.json --after-rollback
[db:verify:lab4] Results (24 checks, 0 failure(s))
  ActionTaken table, ActionStatus enum, Ticket.version/resolvedAt/statusChangedAt, Lab 4 migration record: all absent
  row counts and per-row checksums of all 8 Lab 1-3 tables: all match (Ticket 28 rows, User 15, ...)
[db:verify:lab4] ✓ All checks passed
```

Docker printed a warning that the `version` attribute in `docker-compose.yml` is obsolete; it has no
effect on the commands.

Lab 3 app from the worktree on this database (port 3300):

```
$ npx tsx scripts/lab3-real-data.ts --base http://localhost:3300 --mode capture --out capture-after-rollback.json
captured 34 responses -> capture-after-rollback.json
sha256(file) = a4b486b89b6b309d5ab54aa236d7c5c492330dc5750cb9efff4ab479c34e8512
before vs after-rollback: IDENTICAL
```

Short write test with the Lab 3 app on the rolled-back database (added as `--mode smoke`):

```
$ npx tsx scripts/lab3-real-data.ts --base http://localhost:3300 --mode smoke
[smoke] Lab 3 write test
  PASS  login jennifer.anderson@example.com: 200 (expected 200)
  PASS  login alex.staff@tiktockit.com: 200 (expected 200)
  PASS  create Ticket (Requester): 201 (expected 201)
        ticket TKT-2026-000029 (NEW)
  PASS  public comment (Requester): 201 (expected 201)
  PASS  internal note (IT Staff): 201 (expected 201)
  PASS  owner -> ben.staff@tiktockit.com: 200 (expected 200)
  PASS  status -> OPEN: 200 (expected 200)
  PASS  status -> IN_PROGRESS: 200 (expected 200)
  PASS  status -> RESOLVED: 200 (expected 200)
  PASS  read back (IT Staff): 200 (expected 200)
  PASS  stored: status RESOLVED, owner Ben Staff, comments 1, notes 1
[smoke] ALL PASSED
```

The Lab 3 app was stopped (port 3300 confirmed free). The smoke test changed the database, so the
step 2 snapshot no longer describes it; a new snapshot was taken for the next upgrade:

```
$ npm run db:snapshot --prefix server
  Category 4 | RequesterUser 0 | RelatedSystem 7 | User 15 | Ticket 29 | Attachment 7 | PublicComment 13 | InternalNote 10
SNAPSHOT_FILE=...\server\backups\snapshot-2026-10-31T03-55-46-344Z.json
```

## Step 5. Upgrade again, restore the backup (Option B), upgrade a final time

```
$ cd server && npx prisma migrate deploy
Applying migration `20261030045000_add_actions_taken_and_workflow_fields`
All migrations have been successfully applied.
$ npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-2026-10-31T03-55-46-344Z.json --at-upgrade
[db:verify:lab4] Results (26 checks, 0 failure(s))       Ticket 29 rows, checksums all match, MIG-02 checks 0 bad
[db:verify:lab4] ✓ All checks passed
```

Rollback Option B, the two README commands exactly as written, from the repository root, with the
step 2 backup (the state before Lab 4):

```
$ docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
   (target printed first: toktickit_db)
NOTICE:  drop cascades to 15 other objects ... drop cascades to table "ActionTaken"
DROP SCHEMA
CREATE SCHEMA
exit=0
$ docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -X -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < server/backups/lab3-before-lab4-2026-10-31T03-46-14-578Z.sql
   (output summarised) CREATE TABLE x10, CREATE TYPE x3, CREATE INDEX x14, ALTER TABLE x38,
   COPY 28 (Ticket), COPY 15 (User), COPY 19 (Session), COPY 12, COPY 9 x2, COPY 7 x2, COPY 4, COPY 0; no ERROR
exit=0
```

As the README says, Option B returns the whole database to the moment of the backup, so everything
written after the backup is lost here: the 117 Actions of step 3 (which are kept in the Option A export
file) and the smoke-test Ticket TKT-2026-000029 with its comment, note, owner, and status history.
That is why the verification below uses the step 2 snapshot again and shows Ticket 28 rows.

```
$ npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-2026-10-31T03-46-21-634Z.json --after-rollback
[db:verify:lab4] Results (24 checks, 0 failure(s))       all Lab 4 objects absent; Ticket 28 rows; all checksums match
[db:verify:lab4] ✓ All checks passed

$ (Lab 3 app from the worktree on 3300) npx tsx scripts/lab3-real-data.ts --base http://localhost:3300 --mode capture --out capture-after-restore.json
sha256(file) = a4b486b89b6b309d5ab54aa236d7c5c492330dc5750cb9efff4ab479c34e8512
before vs after-restore (Option B): IDENTICAL
   (Lab 3 app stopped, port 3300 free)

$ cd server && npx prisma migrate deploy
Applying migration `20261030045000_add_actions_taken_and_workflow_fields`
All migrations have been successfully applied.
$ npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-2026-10-31T03-46-21-634Z.json --at-upgrade
[db:verify:lab4] Results (26 checks, 0 failure(s))       all checksums match; ActionTaken 0 rows; MIG-02 checks 0 bad
[db:verify:lab4] ✓ All checks passed
```

One more live-check round with the Lab 4 app (port 3400) on this final database, after the full
cycle upgrade → rollback → restore → upgrade:

```
$ npx tsx scripts/lab4-live-check.ts --base http://localhost:3400 --round 4-final
  PASS  (a) statuses: 200 x19, 201 x1 | same id: 1 | rows with that clientRequestId: 1 | Actions 0 -> 1
  PASS  (b) statuses: 201 x20 | distinct ids: 20 | Actions 1 -> 21 (+20)
  PASS  (c) statuses: 200 x1, 409 STALE_VERSION x19 | version 1 -> 2 | stored = writer 1
  PASS  (d) statuses: 200 x1, 409 ACTION_TERMINAL x9 | COMPLETED, version 1 -> 2
  PASS  (e) every cell matches api-spec section 11: 7 callers x 4 endpoints (same table as step 3)
  PASS  (e) refused edits and status changes wrote nothing: 10 target Actions, 0 changed
  PASS  (f) actions list and Lab 3 ticket detail: byte-identical 404
  PASS  Ticket row unchanged
Actions on TKT-2026-000008: 39; ActionTaken total: 39
[live-check round 4-final] ALL PASSED

$ npx tsx scripts/lab3-real-data.ts --base http://localhost:3400 --mode capture --out capture-final.json
sha256(file) = a4b486b89b6b309d5ab54aa236d7c5c492330dc5750cb9efff4ab479c34e8512
before vs final (Lab 4, after live-check): IDENTICAL
```

The Action ids start at 1 again because the table was recreated by the final migration.
The Lab 4 app was stopped; ports 3000, 3300, 3400, and 5173 are free and no `tsx src/index.ts`
process is left.

## Step 6, first run. Clean-up (finished 2026-10-31T04:03:20Z)

Step 5b (below) was requested after this run, so the database was rebuilt for it and step 6 is to
be run again after step 5b.

```
$ npm run db:reset --prefix server                  # target printed first: toktickit_db
10 migrations found in prisma/migrations
All migrations have been successfully applied.
Seeding categories, users, and related systems completed successfully.
Database reset completed successfully.

$ ports 3000, 3300, 3400, 5173: free | node "tsx src/index.ts" processes: none

$ git worktree remove ../toktickit-lab3-release && git worktree prune && git worktree list
D:/ปี3/Term1/CPE334 SOF EN/toktickit       3b36488 [feature/2-lab4-actions-taken-foundation]

$ cd server && npx vitest run                       # on the database just reset, 04:02:26Z - 04:03:20Z
 Test Files  25 passed (25)
      Tests  233 passed (233)
   Duration  50.49s

$ git status --short
?? docs/lab-04/evidence/
?? server/scripts/lab3-real-data.ts
?? server/scripts/lab4-live-check.ts

$ git diff --stat -- server/tests/lab-01 server/tests/lab-02 server/tests/lab-03 client/tests e2e
(empty)

$ docker exec toktickit-db psql -d postgres -c "SELECT datname FROM pg_database"
postgres | template0 | template1 | toktickit_db          (no toktickit_upgrade_test)

$ cd server && npx prisma migrate status
10 migrations found in prisma/migrations
Database schema is up to date!
```

README was not changed: every README command ran as written. Nothing was committed or pushed.
The backup, snapshots, and Actions export of this rehearsal stay in `server/backups/` (git-ignored).

## Results by step (steps 1-6, first run)

| Check | Result |
|---|---|
| Lab 3 data created through the Lab 3 HTTP API only | pass |
| Upgrade by the README; verify --at-upgrade; backfill 0 rows; MIG-02 for all 28 Tickets | pass |
| Lab 3 GET responses byte-identical: before = after upgrade = after live checks = after rollback = after restore = final | pass (sha256 `a4b486b8…c34e8512` every time) |
| (a) replay idempotency, 20 parallel, 4 rounds | pass |
| (b) 20 parallel distinct creates, 4 rounds | pass |
| (c) stale edit, 20 parallel, 4 rounds | pass |
| (d) stale status change, 10 parallel, 4 rounds | pass |
| (e) authorization, 7 callers x 4 endpoints, 4 rounds | pass (28/28 each round) |
| Other Requester's Ticket vs missing Ticket byte-identical | pass |
| Rollback Option A: export rowCount 117, sorted ids = database; verify --after-rollback | pass |
| Lab 3 write smoke test on the rolled-back database | pass |
| Upgrade again; Option B restore; verify; capture; upgrade; verify; final live check | pass |
| Clean-up, first run: db:reset, no processes, worktree removed, vitest 25 files / 233 tests | pass (to be repeated after step 5b) |

## Step 5b. statusChangedAt (BR-39) on the Lab 4 database with real data

Step 6 had already reset the database, so the end-of-step-5 state was rebuilt first, with the step 2
backup and the README commands (target printed first: `toktickit_db`):

```
$ docker compose exec -T postgres sh -c 'psql ... -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
DROP SCHEMA
CREATE SCHEMA
$ docker compose exec -T postgres sh -c 'psql ... -d "$POSTGRES_DB"' < server/backups/lab3-before-lab4-2026-10-31T03-46-14-578Z.sql
COPY 7 COPY 4 COPY 9 COPY 12 COPY 7 COPY 0 COPY 19 COPY 28 COPY 15 COPY 9      (no ERROR)
$ cd server && npx prisma migrate deploy
Applying migration `20261030045000_add_actions_taken_and_workflow_fields`
All migrations have been successfully applied.
$ npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-2026-10-31T03-46-21-634Z.json --at-upgrade
[db:verify:lab4] Results (26 checks, 0 failure(s))
[db:verify:lab4] ✓ All checks passed
```

`lab4-live-check.ts --mode status-changed-at` creates a new Ticket as jennifer (so no captured Ticket
is touched), writes every step through HTTP (jennifer for the Ticket and comment, alex for everything
else), and reads the row after each step with a read-only
`SELECT "currentStatus", "statusChangedAt"::text, "updatedAt"::text, "createdAt"::text, version`.
Values are compared as the stored text, so "unchanged" means every digit is the same. Postgres prints
timestamps without trailing zeros (`04:54:24.01` is `.010`). Steps are 25 ms apart. Lab 4 app on 3400.

```
$ npx tsx scripts/lab4-live-check.ts --base http://localhost:3400 --mode status-changed-at --round 1
[status-changed-at round 1] Ticket TKT-2026-000029 (id 29), Requester jennifer.anderson@example.com, staff alex.staff@tiktockit.com
  ok   | step                                     | HTTP | currentStatus         | statusChangedAt         | updatedAt               | sca chg | upd chg | expected
  PASS | 1 create Ticket                          | 201  | NEW                   | 2026-10-31 04:54:23.805 | 2026-10-31 04:54:23.805 | -       | -       | statusChangedAt - createdAt = 0 ms (<= 1000)
  PASS | 2a public comment (Requester)            | 201  | NEW                   | 2026-10-31 04:54:23.805 | 2026-10-31 04:54:23.805 | no      | no      | HTTP 201, statusChangedAt unchanged
  PASS | 2b internal note (IT Staff)              | 201  | NEW                   | 2026-10-31 04:54:23.805 | 2026-10-31 04:54:23.805 | no      | no      | HTTP 201, statusChangedAt unchanged
  PASS | 2c owner -> ben                          | 200  | NEW                   | 2026-10-31 04:54:23.805 | 2026-10-31 04:54:24.01  | no      | yes     | HTTP 200, statusChangedAt unchanged, updatedAt changed
  PASS | 2d IT priority -> HIGH                   | 200  | NEW                   | 2026-10-31 04:54:23.805 | 2026-10-31 04:54:24.069 | no      | yes     | HTTP 200, statusChangedAt unchanged, updatedAt changed
  PASS | 2e create Action                         | 201  | NEW                   | 2026-10-31 04:54:23.805 | 2026-10-31 04:54:24.069 | no      | no      | HTTP 201, statusChangedAt unchanged
  PASS | 2f edit Action (PATCH)                   | 200  | NEW                   | 2026-10-31 04:54:23.805 | 2026-10-31 04:54:24.069 | no      | no      | HTTP 200, statusChangedAt unchanged
  PASS | 2g Action status -> IN_PROGRESS          | 200  | NEW                   | 2026-10-31 04:54:23.805 | 2026-10-31 04:54:24.069 | no      | no      | HTTP 200, statusChangedAt unchanged
  PASS | 2h refused transition NEW -> RESOLVED    | 400  | NEW                   | 2026-10-31 04:54:23.805 | 2026-10-31 04:54:24.069 | no      | no      | HTTP 400, statusChangedAt unchanged
  PASS | 3a NEW -> OPEN                           | 200  | OPEN                  | 2026-10-31 04:54:24.36  | 2026-10-31 04:54:24.361 | yes     | yes     | HTTP 200, later than before
  PASS | 3b OPEN -> IN_PROGRESS                   | 200  | IN_PROGRESS           | 2026-10-31 04:54:24.404 | 2026-10-31 04:54:24.405 | yes     | yes     | HTTP 200, later than before
  PASS | 3c IN_PROGRESS -> WAITING_FOR_REQUESTER  | 200  | WAITING_FOR_REQUESTER | 2026-10-31 04:54:24.451 | 2026-10-31 04:54:24.452 | yes     | yes     | HTTP 200, later than before
  PASS | 3d WAITING_FOR_REQUESTER -> IN_PROGRESS  | 200  | IN_PROGRESS           | 2026-10-31 04:54:24.498 | 2026-10-31 04:54:24.499 | yes     | yes     | HTTP 200, later than before
  PASS | 3e IN_PROGRESS -> WAITING_FOR_REQUESTER  | 200  | WAITING_FOR_REQUESTER | 2026-10-31 04:54:24.545 | 2026-10-31 04:54:24.546 | yes     | yes     | HTTP 200, later than before and than the first WAITING
  final version of the Ticket row: 1
[status-changed-at round 1] ALL PASSED (14 steps)

$ npx tsx scripts/lab4-live-check.ts --base http://localhost:3400 --mode status-changed-at --round 2
[status-changed-at round 2] Ticket TKT-2026-000030 (id 30), Requester jennifer.anderson@example.com, staff alex.staff@tiktockit.com
  PASS | 1 create Ticket                          | 201  | NEW                   | 2026-10-31 04:54:27.223 | 2026-10-31 04:54:27.223 | -       | -       | statusChangedAt - createdAt = 0 ms (<= 1000)
  PASS | 2a public comment (Requester)            | 201  | NEW                   | 2026-10-31 04:54:27.223 | 2026-10-31 04:54:27.223 | no      | no      | HTTP 201, statusChangedAt unchanged
  PASS | 2b internal note (IT Staff)              | 201  | NEW                   | 2026-10-31 04:54:27.223 | 2026-10-31 04:54:27.223 | no      | no      | HTTP 201, statusChangedAt unchanged
  PASS | 2c owner -> ben                          | 200  | NEW                   | 2026-10-31 04:54:27.223 | 2026-10-31 04:54:27.409 | no      | yes     | HTTP 200, statusChangedAt unchanged, updatedAt changed
  PASS | 2d IT priority -> HIGH                   | 200  | NEW                   | 2026-10-31 04:54:27.223 | 2026-10-31 04:54:27.453 | no      | yes     | HTTP 200, statusChangedAt unchanged, updatedAt changed
  PASS | 2e create Action                         | 201  | NEW                   | 2026-10-31 04:54:27.223 | 2026-10-31 04:54:27.453 | no      | no      | HTTP 201, statusChangedAt unchanged
  PASS | 2f edit Action (PATCH)                   | 200  | NEW                   | 2026-10-31 04:54:27.223 | 2026-10-31 04:54:27.453 | no      | no      | HTTP 200, statusChangedAt unchanged
  PASS | 2g Action status -> IN_PROGRESS          | 200  | NEW                   | 2026-10-31 04:54:27.223 | 2026-10-31 04:54:27.453 | no      | no      | HTTP 200, statusChangedAt unchanged
  PASS | 2h refused transition NEW -> RESOLVED    | 400  | NEW                   | 2026-10-31 04:54:27.223 | 2026-10-31 04:54:27.453 | no      | no      | HTTP 400, statusChangedAt unchanged
  PASS | 3a NEW -> OPEN                           | 200  | OPEN                  | 2026-10-31 04:54:27.731 | 2026-10-31 04:54:27.732 | yes     | yes     | HTTP 200, later than before
  PASS | 3b OPEN -> IN_PROGRESS                   | 200  | IN_PROGRESS           | 2026-10-31 04:54:27.777 | 2026-10-31 04:54:27.778 | yes     | yes     | HTTP 200, later than before
  PASS | 3c IN_PROGRESS -> WAITING_FOR_REQUESTER  | 200  | WAITING_FOR_REQUESTER | 2026-10-31 04:54:27.823 | 2026-10-31 04:54:27.824 | yes     | yes     | HTTP 200, later than before
  PASS | 3d WAITING_FOR_REQUESTER -> IN_PROGRESS  | 200  | IN_PROGRESS           | 2026-10-31 04:54:27.87  | 2026-10-31 04:54:27.871 | yes     | yes     | HTTP 200, later than before
  PASS | 3e IN_PROGRESS -> WAITING_FOR_REQUESTER  | 200  | WAITING_FOR_REQUESTER | 2026-10-31 04:54:27.918 | 2026-10-31 04:54:27.919 | yes     | yes     | HTTP 200, later than before and than the first WAITING
  final version of the Ticket row: 1
[status-changed-at round 2] ALL PASSED (14 steps)
```

(The HTTP column is narrowed for reading; the values are as printed.)

Result: in both rounds `statusChangedAt` equals `createdAt` at creation (0 ms apart); it keeps every
digit through a comment, a note, an owner change, an IT priority change, an Action create, edit, and
status change, and a refused transition (400); `updatedAt` does change at the owner and priority steps,
so the two clocks are separate. Every Ticket status transition moves `statusChangedAt` later, and
re-entering WAITING_FOR_REQUESTER (3e) gives a later value than the first WAITING (3c), so the clock
restarts (BR-39).

Observations, not failures of this check:
- `statusChangedAt` and `updatedAt` differ by 1 ms after a transition: the handler sets
  `statusChangedAt` with `new Date()` and Prisma sets `@updatedAt` separately.
- The refused transition returns the Lab 3 body without `code`, and the Ticket `version` stays 1. The
  api-spec section 6 changes to the Ticket endpoints (`expectedVersion`/`version`, the resolution gate,
  the `INVALID_TRANSITION` code, the additive response fields) are scheduled for Issue 4 in tests.md
  (API-18, API-39); this branch implements only `statusChangedAt` from that section.

The regular live check, one more round on the same database:

```
$ npx tsx scripts/lab4-live-check.ts --base http://localhost:3400 --round 5b
  PASS  (a) statuses: 200 x19, 201 x1 | same id: 1 distinct id(s): 3 | rows with that clientRequestId: 1 | Actions 0 -> 1
  PASS  (b) statuses: 201 x20 | distinct ids: 20 | Actions 1 -> 21 (+20)
  PASS  (c) statuses: 200 x1, 409 STALE_VERSION x19 | version 1 -> 2 | stored = writer 2
  PASS  (d) statuses: 200 x1, 409 ACTION_TERMINAL x9 | COMPLETED, version 1 -> 2
  PASS  (e) every cell matches api-spec section 11: 7 callers x 4 endpoints
  PASS  (e) refused edits and status changes wrote nothing: 10 target Actions, 0 changed
  PASS  (f) actions list and Lab 3 ticket detail: byte-identical 404
  PASS  Ticket row unchanged
Actions on TKT-2026-000008: 39; ActionTaken total: 41
[live-check round 5b] ALL PASSED
```

(ActionTaken total 41 = 39 from this round + 1 Action on each of the two step 5b Tickets.)
The Lab 4 app was stopped; ports 3000, 3300, 3400, and 5173 are free and no `tsx src/index.ts`
process is left.

## Step 6, final run (the run that counts). Clean-up (finished 2026-10-31T05:10:35Z)

```
$ npm run db:reset --prefix server                  # target printed first: toktickit_db
10 migrations found in prisma/migrations
All migrations have been successfully applied.
Seeding categories, users, and related systems completed successfully.
Database reset completed successfully.

$ ports 3000, 3300, 3400, 5173: free | node "tsx src/index.ts" processes: none

$ git worktree prune && git worktree list
D:/ปี3/Term1/CPE334 SOF EN/toktickit       9380dd9 [feature/2-lab4-actions-taken-foundation]

$ cd server && npx vitest run                       # on the database just reset, 05:09:13Z - 05:10:17Z
 Test Files  25 passed (25)
      Tests  233 passed (233)
   Duration  59.34s

$ cd client && npx vitest run                       # first run, finished 05:10:35Z
 FAIL  tests/lab-01/App.test.tsx > App > renders Create Support Ticket screen when authenticated user is active
 Test Files  1 failed | 10 passed (11)
      Tests  1 failed | 47 passed (48)
$ npx vitest run tests/lab-01/App.test.tsx          # the failing file alone
      Tests  4 passed (4)
$ npx vitest run                                    # second full run
 Test Files  11 passed (11)
      Tests  48 passed (48)

$ git status --short
 M docs/lab-04/evidence/issue-2-rehearsal.md
 M server/scripts/lab4-live-check.ts

$ git diff --stat -- server/tests/lab-01 server/tests/lab-02 server/tests/lab-03 client/tests e2e
(empty)

$ docker exec toktickit-db psql -d postgres -c "SELECT datname FROM pg_database"
postgres | template0 | template1 | toktickit_db          (no toktickit_upgrade_test)

$ cd server && npx prisma migrate status
10 migrations found in prisma/migrations
Database schema is up to date!
```

The client failure is recorded as it happened. The error text of the first run was not kept. The test
waits for the "My Tickets" heading and then for the "Create Support Ticket" text, each with the default
1 s `waitFor` timeout, and the first run reported a much longer jsdom environment time (72.8 s) right
after the server suite. This points to a timeout under load, but it was not proven. No client file was
changed (`git diff --stat -- client/tests` is empty).
