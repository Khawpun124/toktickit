# Issue 7 Verification: End-to-End, Visual, and Accessibility Testing

| Item | Value |
|---|---|
| Date | 2026-11-01 |
| Branch | `feature/7-lab4-e2e-visual-tests` |
| `git rev-parse HEAD` | `f657509cc28f89eff324b903c92d6a5391dc8b77` |
| `git rev-parse origin/lab4-staging` | `49b9860cfc86baa11f87fd3ffb8ad7a294d8692d` |
| `git rev-parse origin/main` | `1396d2ebd4362c1bafd44b7d0a3d3e64879ee976` (also the merge base with `HEAD`) |
| `node -v` | `v24.14.0` |
| `npx playwright --version` | `1.63.0` |
| `@axe-core/playwright` / `axe-core` | `4.14.0` / `4.14.0` (exact version in `package.json`) |
| Working tree at run time | `HEAD` plus the changes listed below |

**Uncommitted changes in the working tree:**
- **The two defects found in the screenshots (section 6):**
  - `client/src/components/actions/actions.css`: the Actions table fits its card;
  - `client/src/index.css` and `client/src/components/StaffTicketDetailScreen.tsx`: the success toast.
- **Their tests:**
  - `e2e/lab-04/actions-taken-flow.spec.ts`;
  - `e2e/lab-04/ticket-resolution.spec.ts`;
  - `client/tests/lab-04/TicketWorkflow.test.tsx`.
- **The screenshot helpers:** `e2e/lab-04/support/ui.ts`, `fixtures.ts`, and the new `standins.ts`.
- **The 48 regenerated screenshots, and the README.**

## How these figures were produced

**The final run** produced every figure in sections 1 to 8 and 11, in this order:

1. `artifacts/lab-04` deleted.
2. The full Playwright suite (Lab 2, 3, and 4) through `npm run test:e2e`, 4 consecutive rounds,
   each with the JSON reporter and one more reporter kept outside the repository (section 5):
   - round 0 wrote the 48 new screenshots;
   - rounds 1 to 3 were compared with the round before.
3. The full suite once more through `npm run test:e2e:clean`, checked before its `git restore`.
4. `npm run db:reset --prefix server`.
5. The server suite once, then the data criteria query.
6. The client suite once.
7. Client `tsc --noEmit` and `npm run build`.

The JSON and log files are kept outside the repository. No round was repeated.

**Earlier runs:**
- **The CP3 run** began from an empty database volume: `docker compose down -v`,
  `docker compose up -d`, `pg_isready`, `prisma migrate deploy` (10 migrations), and
  `prisma db seed`.
- **The run on `8ae636e`** gave the server and client suites 3 rounds each (server 382/382 and
  client 230/230 every round, the same data criteria) and server `tsc`/`build` exit 0. The commit
  since then (`f657509`) changes only `docs/lab-04/ui-spec.md`, and this Issue changes no file
  under `server/`.
- **CP2** gave section 9 (the axe "before" column) and section 10 (contrast ratios).

## 1. Acceptance Tests of Issue 7

`docs/lab-04/tests.md` assigns 14 rows to Issue 7. Each Playwright test runs on three projects:
desktop 1280×800, tablet 834×1194, and mobile 375×667.

"5/5" means the test passed in all 5 runs of the final run: `test:e2e` rounds 0 to 3 and the
`test:e2e:clean` round.

| ID | Test (file:line, title) | desktop | tablet | mobile |
|---|---|---|---|---|
| E2E-01 | `actions-taken-flow.spec.ts:48` "E2E-01: staff create, edit, start, and complete an Action; the Requester sees it read-only" | 5/5 | 5/5 | 5/5 |
| E2E-02 | `actions-taken-flow.spec.ts:131` "E2E-02: follow-up needs a note; when two staff edit the same Action the second save shows the conflict and keeps the typed text" | 5/5 | 5/5 | 5/5 |
| E2E-03 | `ticket-resolution.spec.ts:46` "E2E-03: Resolved is blocked by an unfinished Action (UI and direct API, flag included), then allowed after completion" | 5/5 | 5/5 | 5/5 |
| E2E-04 | `ticket-resolution.spec.ts:125` "E2E-04: cancelling a Ticket cancels its unfinished Actions with the automatic Result" | 5/5 | 5/5 | 5/5 |
| E2E-05 | `dashboards.spec.ts:48` "E2E-05: Staff Dashboard cards equal the Queue totals they open, and Urgent Tickets holds only active High-priority Tickets" | 5/5 | 5/5 | 5/5 |
| E2E-05 | `dashboards.spec.ts:77` "E2E-05: Requester Dashboard cards equal the My Tickets totals they open; a Requester with no Tickets sees zeros and empty messages" | 5/5 | 5/5 | 5/5 |
| E2E-06 | `regression-sweep.spec.ts:58` "E2E-06: every Requester link opens a working screen with no console error or failed request" | 5/5 | 5/5 | 5/5 |
| E2E-06 | `regression-sweep.spec.ts:87` "E2E-06: every IT Staff link opens a working screen with no console error or failed request" | 5/5 | 5/5 | 5/5 |
| E2E-06 | `regression-sweep.spec.ts:126` "E2E-06: every Administrator link opens a working screen with no console error or failed request" | 5/5 | 5/5 | 5/5 |
| E2E-07 | `regression-sweep.spec.ts:148` "E2E-07: Lab 1-3 flow: first login with password change, Ticket with attachment, staff claim, private Internal Note, Administrator creates a user" | 5/5 | 5/5 | 5/5 |
| RESP-01 | `dashboards.spec.ts:48` (six cards in 1 row on desktop, 2 rows on tablet, 3 rows on mobile) and `dashboards.spec.ts:116` "RESP-01: Staff Dashboard empty (no work assigned) and failure states at every viewport" | 5/5 | 5/5 | 5/5 |
| RESP-02 | `dashboards.spec.ts:77` (four cards in 1 row on desktop, 2 rows on tablet and mobile) | 5/5 | 5/5 | 5/5 |
| RESP-03 | `actions-taken-flow.spec.ts` `expectActionsLayout` (table from tablet up, cards on mobile), `expectActionsTableFits` (lines 28, 74, 121: on desktop and tablet the table box has `scrollWidth <= clientWidth` and the first row's View button lies inside the card, on the Staff and the Requester screen), and `expectDialogFits` | 5/5 | 5/5 | 5/5 |
| RESP-04 | `expectNoHorizontalScroll` (`scrollWidth <= clientWidth`) in `dashboards.spec.ts` (all 3 tests) and `actions-taken-flow.spec.ts`, plus the table box check above | 5/5 | 5/5 | 5/5 |
| A11Y-02 | `accessibility.spec.ts:25` "A11Y-02: dashboard cards, the status control, and the Actions dialog work by keyboard with visible focus" | 5/5 | 5/5 | 5/5 |
| A11Y-03 | `accessibility.spec.ts:97` "A11Y-03: axe finds no serious or critical violation on both dashboards and both Ticket Detail screens" | 5/5 | 5/5 | 5/5 |
| MIG-05 | Section 7 | passed | | |

**E2E-03 also checks the success toast** (`ticket-resolution.spec.ts:90-109`, section 6.2):
- the message's computed `position` is `fixed`;
- Ticket Information has the same page y before and while the message shows;
- both section headings have the same page y while the message shows and after it disappears.

### What the E2E-06 tests check

- **Before login.** The app is opened signed out. Exactly two `/api/auth/me` responses must arrive,
  both 401 (Known limits, item 1). The only failed responses allowed are those two, and every
  console error must match one of them by URL, one to one.
- **After login.** Counting starts again. Console errors are counted without a filter and must be 0.
  No response may have status 400 or higher.
- **Requester:** header Dashboard, My Tickets and + Create Ticket; the 4 cards; a Recently updated
  row; quick actions Create Ticket and View My Tickets.
- **IT Staff:** the 6 cards; View all my tickets and View all urgent tickets; a My recent Tickets
  row and a My open Actions row; quick actions Open My Queue, Search Tickets (the search box gets
  focus) and Create Ticket; header My Queue and + Create Ticket.
- **Administrator:** the Users card, the Unassigned and High IT Priority cards, Open My Queue, and
  header Admin / User Management, My Queue and Dashboard. There is no Create Ticket quick action.
- **The one expected 4xx in the file.** In E2E-07, the Requester's
  `GET /api/tickets/:id/notes` returns 403, and the test asserts this.

## 2. Suites per folder (server and client)

| Suite | lab-01 | lab-02 | lab-03 | lab-04 | Total | Result |
|---|---|---|---|---|---|---|
| Server (Vitest), 34 files | 2 files, 3 tests | 6 files, 29 | 8 files, 63 | 18 files, 287 | 382 | 382/382 (77.3 s) |
| Client (Vitest), 19 files | 1 file, 4 tests | 4 files, 19 | 6 files, 25 | 8 files, 183 | 231 | 231/231 (34.0 s) |

The client has one test more than before (183 instead of 182 in lab-04): it is the new UI-09
toast test in `client/tests/lab-04/TicketWorkflow.test.tsx`, "UI-09: the success message is the
bottom toast (ui-spec section 9): class zg-toast, role status, the same text, no inline position".

| Check | Client | Server |
|---|---|---|
| `npx tsc --noEmit` | exit 0 | exit 0 (run on `8ae636e`; no server file changed since) |
| `npm run build` | exit 0 (`tsc && vite build`) | exit 0 (run on `8ae636e`) |

## 3. Data criteria

The columns are the same as in the Issue 6 evidence:
- **act- / ticketwf- / dashtest- / hardtest-**: test users left behind.
- **TKT-PERF-**: PERF-01 Tickets left behind.
- **l4-** and **TKT-L4-**: the Lab 4 seed.
- **inactive-/authtest-**: users that the unchanged Lab 3 tests create, 8 per round (expected).

| Point | act- | ticketwf- | dashtest- | hardtest- | TKT-PERF- | l4- users | TKT-L4- Tickets | ActionTaken (all) | inactive-/authtest- |
|---|---|---|---|---|---|---|---|---|---|
| After `db:reset` and the server round | 0 | 0 | 0 | 0 | 0 | 14 | 10 | 13 | 8 |

## 4. Playwright, full suite (Lab 2, 3, and 4)

| Run | Command | Passed | Failed | Flaky | Skipped | Time | Lab 2 | Lab 3 | Lab 4 |
|---|---|---|---|---|---|---|---|---|---|
| Round 0 (writes the screenshots) | `npm run test:e2e` | 62 | 0 | 0 | 4 | 198 s | 12/12 | 11 passed, 4 skipped | 39/39 |
| Round 1 | `npm run test:e2e` | 62 | 0 | 0 | 4 | 200 s | 12/12 | 11 passed, 4 skipped | 39/39 |
| Round 2 | `npm run test:e2e` | 62 | 0 | 0 | 4 | 205 s | 12/12 | 11 passed, 4 skipped | 39/39 |
| Round 3 | `npm run test:e2e` | 62 | 0 | 0 | 4 | 199 s | 12/12 | 11 passed, 4 skipped | 39/39 |
| Clean round | `npm run test:e2e:clean` | 62 | 0 | 0 | 4 | 207 s | 12/12 | 11 passed, 4 skipped | 39/39 |

- **Failed runs:** 0 of 5. No trace was needed (the config keeps traces only on failure).
- **The 4 skips** are the `test.skip()` calls already in `e2e/lab-03/staff-ticket-flow.spec.ts`
  (lines 90, 222, 243):
  - E2E-02 on tablet and mobile;
  - RESP-02a and RESP-02b on desktop.

  That file is unchanged.

## 5. Screenshot stability

**How the images are made stable.** `snap` (`e2e/lab-04/support/ui.ts`) is the last step of every
screenshot state.

1. It replaces, in the page, the text that changes from run to run with fixed text:
   - **The users each test creates** get readable stand-ins (`e2e/lab-04/support/standins.ts`), in
     the order the test creates them, per role. IT Staff are Jordan Staff, then Riley Staff;
     the Requester is Casey Requester; e-mail addresses become, for example,
     `casey.requester@example.test`.
   - **Generated Ticket numbers** become `TKT-0000-000000`.
   - **Dates and times, in every format the screens use**, keep their format and show midnight on
     1 Jan 2026.
   - **`datetime-local` fields** get the value `2026-01-01T00:00`.
2. It captures the page.
3. It puts every original text and value back, so the assertions after the screenshot see the real
   page.

No mask is used.

The Lab 4 browser also runs with `--disable-gpu`, `--disable-partial-raster`, and
`--disable-skia-runtime-opts` (`e2e/lab-04/support/fixtures.ts`, Lab 4 specs only).
- **Without these flags:** the anti-aliased edges of rounded corners changed by 23 to 48 pixels
  between runs.

**Viewport or full page.**
- **Viewport (`fullPage: false`)**, as the user sees it: the states with an open dialog or the
  toast.
  - `actions-taken`: create, edit, validation, conflict, terminal, requester-readonly;
  - `ticket-workflow`: success.
- **Full page:** every other state. A full-page capture draws fixed and sticky elements at a place
  the user never sees them.

**The byte comparison.** The reporter outside the repository hashed all 48 files at the end of each
round, in `onEnd`, and compared them with the previous round.

| Round | Files | Compared with | Identical | Changed | Added | Missing |
|---|---|---|---|---|---|---|
| 0 (`test:e2e`, new images) | 48 | (none) | | | | |
| 1 (`test:e2e`) | 48 | round 0 | 48 | 0 | 0 | 0 |
| 2 (`test:e2e`) | 48 | round 1 | 48 | 0 | 0 | 0 |
| 3 (`test:e2e`) | 48 | round 2 | 48 | 0 | 0 | 0 |
| Clean round (`test:e2e:clean`, before its `git restore`) | 48 | round 3 | 48 | 0 | 0 | 0 |

The `git restore artifacts/` in `test:e2e:clean` puts back the committed images. Afterwards, the
round 3 files were copied back to `artifacts/lab-04` and checked byte for byte (48 of 48 equal).
Nothing was restored to make two rounds match. `artifacts/lab-02` and `artifacts/lab-03` show no
change.

## 6. Defects found in the screenshots, and fixed

### 6.1 The Actions Taken table was clipped (RESP-03, RESP-04)

At 1280 px the last column (the View button) was cut off at the card's edge. The table could not
be narrower than 716 px, so its `.table-responsive` box scrolled sideways.

**Before:** table box `scrollWidth` / `clientWidth` in px. The Staff screen shares the row with
Ticket Operations from 992 px; the Requester screen has the full width.

| Screen | 768 | 834 | 992 | 1200 | 1280 | 1400 | 1440 |
|---|---|---|---|---|---|---|---|
| Staff | 716/648 | 716/648 | 716/568 | 716/688 | 716/688 | 808/808 | 808/808 |
| Requester | 716/646 | 716/646 | fits | fits | fits | fits | fits |

**The fix** is in `client/src/components/actions/actions.css` only. No column, label, id, role, or
text changed:
- the Date/Time cell may wrap;
- Description's minimum width goes from 14rem to 8rem (it keeps its existing 2-line clamp);
- the View column keeps just the button's width (`width: 1%`, `nowrap`).

**After:** at every width above, on both screens, `scrollWidth` equals `clientWidth`. At the
tightest point (Staff, 992 px: 568 = 568), the View button's right edge is 28 px inside the card.

**The new check** (`expectActionsTableFits`) failed before the fix: desktop 716 > 688, tablet
716 > 648. It passes after.

### 6.2 The success message covered the headings and moved the page (ui-spec section 9)

**What was wrong.** On the Staff Ticket Detail the success message was `position: sticky; top: 0`
at the top of the page container.
- **Covering content:** in the viewport, scrolled down, it sat over whatever was at the top of the
  screen. On mobile it covered the "Actions Taken (1)" heading; on desktop, the top of Ticket
  Information.
- **Moving the page:** while it showed (3 s), it pushed all content down, then the content moved
  back. The empty band above "Back to Queue" in the earlier full-page image was this space.

**The fix** follows ui-spec section 9 (commit `f657509`). The inline style was replaced by the
class `.zg-toast` (`client/src/index.css`):
- `position: fixed`, bottom centre;
- `bottom: calc(1rem + env(safe-area-inset-bottom))`;
- `max-width: calc(100vw - 2rem)`;
- `z-index: 1045`: above the page and Bootstrap's sticky and fixed layers (1020, 1030), below the
  modal backdrop (1050);
- `pointer-events: none`.

The text, `role="status"`, and the 3-second time are unchanged.
- **Text colour,** measured in the browser: `rgb(10, 54, 34)` on `rgb(209, 231, 221)`
  (#0a3622 on #d1e7dd) = 10.35:1.
- **Other screens:** no other screen in `client/src` uses a sticky alert, so nothing else was
  changed.

**E2E-03 before and after**, page y in px:

| | desktop | tablet | mobile |
|---|---|---|---|
| Message `position` before / after | sticky / fixed | sticky / fixed | sticky / fixed |
| Ticket Information before / while the message shows, old style | 189 / 247 | 212 / 270 | 316 / 398 |
| Ticket Information before / while the message shows, new toast | 189 / 189 | 212 / 212 | equal |
| Actions Taken while shown / after it disappears, old style | 752 / 694 | 775 / 717 | moved |
| Actions Taken while shown / after it disappears, new toast | equal | equal | equal |

Resolving a Ticket also changes the Actions Taken header: the Add Action button gives way to the
line "Reopen the Ticket to add actions.", which moves that heading by 10 px. For that reason,
Actions Taken is compared between "while shown" and "after it disappears" (same content), and
Ticket Information with the state before the change.

**Client test:** "UI-09: the success message is the bottom toast…" passes, checking the class, the
role, the text, and no inline style. Axe on the Staff Ticket Detail: no serious or critical
violation (section 9).

## 7. MIG-05: Lab 1-3 test files unchanged and passing

**The paths checked:**

```text
server/tests/lab-01 server/tests/lab-02 server/tests/lab-03
client/tests/lab-01 client/tests/lab-02 client/tests/lab-03
e2e/lab-02 e2e/lab-03
```

| Comparison | Output |
|---|---|
| `git diff --stat origin/main...HEAD -- <paths>` | empty |
| `git diff --stat origin/lab4-staging...HEAD -- <paths>` | empty |
| `git diff --stat HEAD -- <paths>` (working tree) | empty |

| Old tests passing in the final run | Result |
|---|---|
| Server lab-01, lab-02, lab-03 (16 files) | 95/95 |
| Client lab-01, lab-02, lab-03 (11 files) | 48/48 |
| Playwright `e2e/lab-02` | 12/12 in each of 5 runs |
| Playwright `e2e/lab-03` | 11 passed and 4 skipped (the spec's own `test.skip()`) in each of 5 runs |

The Lab 4 specs do not use the Lab 3 helper `loginAndHandlePasswordChange`. They use
`loginViaUi` and `changePasswordViaUi` from `e2e/lab-04/support/ui.ts`.

## 8. CI

- `.github/workflows/ci.yml:175`: the job `e2e-tests` runs `npm run test:e2e`, which is
  `playwright test`.
- `playwright.config.ts:5` sets `testDir: "./e2e"`, so `e2e/lab-04` runs in CI with no change to the
  workflow.
- The Lab 4 global setup step (`e2e/global-setup.ts` calls `e2e/lab-04/support/prepare.ts`) needs
  no CI secret. It reads the seed password the same way the server does: the environment, then
  `server/.env`, then the default in `server/src/constants.ts`.
- CI uses Node 20 on Ubuntu. This run used Node 24 on Windows.

## 9. Axe results (A11Y-03)

**Configuration.** `new AxeBuilder({ page }).analyze()` at `e2e/lab-04/accessibility.spec.ts:125`.
- No `withTags`, `withRules`, `disableRules` or `exclude`, so every rule axe-core 4.14.0 runs by
  default is included.
- The test fails on any violation whose impact is serious or critical.
- It attaches `axe-summary.json` to every result.

**Before and after.** Each cell is the rule (impact) and the number of elements. Desktop, tablet
and mobile gave identical results.

| Screen | Before (CP2) | After (every run of the final run) |
|---|---|---|
| Requester Dashboard | color-contrast (serious): 2; label-content-name-mismatch (serious): 4 | none |
| Staff Dashboard | color-contrast (serious): 2; label-content-name-mismatch (serious): 6 | none |
| Requester Ticket Detail | color-contrast (serious): 3 | none |
| Staff Ticket Detail | color-contrast (serious): 4; page-has-heading-one (moderate): 1 | page-has-heading-one (moderate): 1 |
| **Serious or critical per viewport** | **21** | **0** |

**The fixes:**
- **color-contrast:** fixed in CSS (commit `3161501`; section 10).
- **label-content-name-mismatch:** each card's accessible name is now its visible text (for
  example "My Assigned 4 View all"), with no `aria-label`. The arrow is `aria-hidden`. The longer
  sentence is a visually hidden element referenced by `aria-describedby` (commit `8ae636e`,
  following the ui-spec change in `25a3d64`).

The scan runs while the toast is not showing; the toast's contrast is measured in section 6.2.

## 10. Contrast ratios (WCAG 1.4.3, 4.5:1)

| Colour pair | Before | After |
|---|---|---|
| Active header item (`aria-current="page"`), text on `#f8f9fa` | `#198754`: 4.30:1 | `#006B3C`: 6.29:1 |
| `.btn-outline-secondary` (Refresh, Back) on the page background `#F5F7F6` | `#6c757d`: 4.36:1 | `#565e64`: 6.14:1 |
| Inactive tabs (Internal Notes, Attachments) on the card header `#f8f9fa` | `#0d6efd`: 4.27:1 | `#0a58ca`: 6.11:1 |
| "Not yet assigned" badge | `text-muted` with `opacity-75`: about 3.67:1 (calculated, blending 0.75 opacity over white) | `#565e64` on `#f8f9fa`: 6.26:1 |
| Success toast (section 6.2) | (unchanged) | `#0a3622` on `#d1e7dd`: 10.35:1 |

## 11. Screenshots (48, from round 0 of the final run, identical in every later run)

Named `<state>-<viewport>.png` under `artifacts/lab-04/screenshots/`. Sizes are in KB. No file is
larger than 500 KB. "V" marks a viewport capture; the others are full page.

| Folder | State | desktop | tablet | mobile |
|---|---|---|---|---|
| staff-dashboard | populated | 119.9 | 117.5 | 112.9 |
| staff-dashboard | empty | 69.6 | 69.5 | 68.3 |
| staff-dashboard | failure | 24.2 | 24.9 | 17.0 |
| requester-dashboard | populated | 95.3 | 95.6 | 86.5 |
| requester-dashboard | empty | 45.8 | 48.5 | 43.5 |
| actions-taken | list | 83.3 | 82.1 | 79.4 |
| actions-taken | create (V) | 63.8 | 54.5 | 22.7 |
| actions-taken | edit (V) | 59.8 | 53.9 | 23.2 |
| actions-taken | validation (V) | 63.0 | 48.7 | 20.2 |
| actions-taken | conflict (V) | 56.8 | 49.5 | 22.7 |
| actions-taken | terminal (V) | 55.4 | 56.4 | 19.6 |
| actions-taken | requester-readonly (V) | 69.2 | 64.5 | 22.8 |
| ticket-workflow | permitted-transitions | 78.3 | 77.1 | 74.5 |
| ticket-workflow | confirmation | 85.5 | 84.3 | 85.0 |
| ticket-workflow | gate-block | 82.1 | 81.4 | 78.8 |
| ticket-workflow | success (V) | 57.4 | 69.1 | 27.2 |

**Scroll position of the viewport captures** (`scrollY` / the most the page can scroll, in px).
`snap` records it as an annotation.

| State | desktop | tablet | mobile |
|---|---|---|---|
| actions-taken/create | 0 / 279 | 0 / 275 | 783 / 1231 |
| actions-taken/edit | 344 / 344 | 0 / 408 | 783 / 1516 |
| actions-taken/validation | 0 / 344 | 0 / 340 | 783 / 1427 |
| actions-taken/conflict | 344 / 344 | 0 / 340 | 1035 / 1427 |
| actions-taken/terminal | 344 / 344 | 0 / 340 | 783 / 1427 |
| actions-taken/requester-readonly | 0 / 525 | 0 / 133 | 864 / 1245 |
| ticket-workflow/success | 324 / 324 | 0 / 320 | 1059 / 1428 |

**The tests that take them** (all through `snap`):

| Test | Screenshots |
|---|---|
| `dashboards.spec.ts:48` (E2E-05, Staff) | `staff-dashboard/populated` |
| `dashboards.spec.ts:77` (E2E-05, Requester) | `requester-dashboard/populated`, `requester-dashboard/empty` |
| `dashboards.spec.ts:116` (RESP-01) | `staff-dashboard/empty`, `staff-dashboard/failure` |
| `actions-taken-flow.spec.ts:48` (E2E-01) | `actions-taken/create`, `list`, `edit`, `terminal`, `requester-readonly` |
| `actions-taken-flow.spec.ts:131` (E2E-02) | `actions-taken/validation`, `conflict` |
| `ticket-resolution.spec.ts:46` (E2E-03) | `ticket-workflow/gate-block`, `permitted-transitions`, `success` |
| `ticket-resolution.spec.ts:125` (E2E-04) | `ticket-workflow/confirmation` |

## 12. Visual and accessibility checklist

For the tester to fill in after opening each screenshot. The items are from `tests.md` section 4.

| # | Item | Screenshots | Manual check (tester, date, result) |
|---|---|---|---|
| 1 | Desktop (992 px and wider): Staff Dashboard, Requester Dashboard, Ticket Detail with Actions Taken, Ticket workflow | `*-desktop.png` in all four folders | |
| 2 | Tablet (768-991 px): the same four screens | `*-tablet.png` | |
| 3 | Mobile (under 768 px): the same four screens, with no horizontal page scrolling | `*-mobile.png` | |
| 4 | Metric cards consistent in size, label, value, and link style | `staff-dashboard/populated-*`, `requester-dashboard/populated-*` | |
| 5 | Status, priority, and role badges legible and always carry text | `staff-dashboard/populated-*`, `actions-taken/list-*`, `ticket-workflow/success-*` | |
| 6 | Actions Taken distinct from Internal Notes, with the "visible to the Requester" label | `actions-taken/list-*`, `actions-taken/requester-readonly-*` | |
| 7 | Editable and read-only fields clearly different; terminal Actions look read-only | `actions-taken/edit-*`, `actions-taken/terminal-*` | |
| 8 | Validation messages directly under their fields | `actions-taken/validation-*` | |
| 9 | Modal dialog fully visible on mobile, not clipped | `actions-taken/create-mobile`, `edit-mobile`, `validation-mobile`, `conflict-mobile` | |
| 10 | Visible focus on every interactive element; tab order follows reading order | A11Y-02 (no screenshot) | |
| 11 | Empty, no-results, forbidden, conflict, and failure states consistent | `staff-dashboard/empty-*`, `failure-*`, `requester-dashboard/empty-*`, `actions-taken/conflict-*`, `ticket-workflow/gate-block-*` | |
| 12 | No placeholder text, unfinished controls, or leftover UI from earlier labs | all 48 | |

## 13. Known limits

1. **Two session checks before login in development.** The dev server renders `<App>` inside
   `React.StrictMode` (`client/src/main.tsx`), so AuthProvider mounts twice and the signed-out
   session check (`GET /api/auth/me`, 401) runs twice. That gives two console errors. A production
   build makes the check once. This was measured on the same machine, signed out:

   | Build | `/api/auth/me` | Console errors |
   |---|---|---|
   | Dev server (port 5173) | 401, 401 | 2 |
   | `vite build` + `vite preview` (port 4173) | 401 | 1 |

   E2E-06 runs against the dev server, so it expects exactly 2 and ties each console error to
   one of those responses.
2. **The confirmation screenshot shows the control before the change.** A screenshot cannot
   capture the browser's own `window.confirm` dialog. `ticket-workflow/confirmation-*` therefore
   shows the status control just before the change. The test that takes the image
   (E2E-04, `ticket-resolution.spec.ts`) asserts the dialog's exact text: "Change status from
   In Progress to Cancelled?", a blank line, then "2 unfinished action(s) will be cancelled
   automatically."
3. **"Empty" Staff Dashboard means real data for a user with no work.** It uses the seeded
   `l4-dash-staff-idle` account. The "My" card and lists are empty, but the system-wide cards
   (Unassigned, New, In Progress, and so on) are not 0.
4. **page-has-heading-one (moderate) on Staff Ticket Detail.** Recorded, not fixed. It is not
   serious or critical, so A11Y-03 does not fail on it.
5. **Font rendering differs by platform.** The committed images come from Windows (Chromium,
   Playwright 1.63, Node 24). Images made in CI (Ubuntu, Node 20) can differ in font rendering.
   No test compares images pixel by pixel. The byte comparison in section 5 holds on one machine.
6. **The date-time field's focus ring.** Inside the native `datetime-local` field, the day, month,
   year, time and calendar button are tab stops in the browser's own shadow DOM, and the browser
   draws their focus ring. A11Y-02 checks there that the field itself holds focus. For every other
   control it checks a computed outline of at least 2 px or a box-shadow.
7. **The screenshots show stand-in names and text** (section 5), not the values the tests typed.
   The real test e-mail addresses are about 55 characters long. The stand-ins are about 28, so in
   the screenshots the Requester line on Ticket Detail takes 2 lines where the real address takes
   3. Nothing else in the layout changes.
8. **The toast can cover the bottom edge of the page for 3 seconds.** In `ticket-workflow/success-mobile`
   (scrolled to y 1059) it sits over the bottom of the Public Comment box and the Post Comment
   button. It does not take clicks (`pointer-events: none`), and it does not cover a heading or the
   status control that was used.
9. **The time on the Actions table can break before "PM"** at some widths (for example 1280 px).
   The app writes a normal space before AM/PM, so the browser may wrap there.

## 14. GitHub CI

| Workflow run | Commit | Result | Checked by |
|---|---|---|---|
| | | | |
