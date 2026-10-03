# Lab 3 — AI Use and Reflection

I used **[ชื่อ AI coding agent เช่น Antigravity]** as the AI Coding Agent
for implementation, and a general-purpose LLM chat assistant as the AI
Specification Agent to draft `specification.md`, `tests.md`,
`ui-spec.md`, and `api-spec.md` before any code was written, continuing
the Spec-Driven Development approach from Lab 2.

## Selected Key Prompts

| # | Prompt Name | What I Did With the Result |
|---|---|---|
| 1 | Draft Sprint Specification with Authorization Matrix | Asked the AI Specification Agent to translate the stakeholder request into `specification.md` covering authentication, a full authorization matrix for three roles, and a complete Status Transition Matrix (14 From→To pairs with permitted roles and confirmation requirements) — the labsheet only gave BR examples, so this had to be built out fully before implementation. |
| 2 | Implement Authentication Foundation with Migration | Gave the agent the contract for Issue 2 and explicitly required it to flag ambiguities (session storage approach, migration script structure) before writing code rather than guessing. It proposed session-based auth with bcrypt hashing and a separate migration script. |
| 3 | Audit and Fix a Security Vulnerability (Spoofing) | A partner review found that `X-Requester-Id` still let any authenticated user impersonate another by header. Prompted the agent to remove the header entirely and derive identity solely from the session, then verified the fix myself via direct `curl` requests rather than trusting the agent's report. |
| 4 | Diagnose and Fix a Migration-Integrity Bug Using a Verification Script | A partner review identified that the FK constraint migration had no accompanying data-copy step, meaning it would fail against a real (non-fresh) Lab 2 database. Prompted the agent to use Prisma's expand-and-contract pattern and to write a standalone script that simulates an existing Lab 2 database, runs the full migration chain, and produces a side-by-side Ticket Ownership Comparison Matrix (ticket number + requester email, before vs. after) — not just a pass/fail check — since the risk was silent data corruption, which ordinary tests on a fresh database could never catch. |
| 5 | Verify a Password Hash Claim Independently | After the agent reported a password-hash fix as complete, I independently wrote a small script to pull the real hash from the database and run `bcrypt.compareSync` against it myself. The first check actually returned `false`, revealing the agent's fix was incomplete — a second, more thorough fix (removing the hardcoded hash entirely rather than editing it) was needed. |
| 6 | Diagnose a CI-Only Test Failure (Fresh Database vs. Local) | Tests passed 41/41 locally but failed on GitHub Actions. Prompted the agent to reproduce the CI environment locally (`docker compose down -v` before every verification) rather than trust a local pass, which surfaced hardcoded IDs and incomplete seed data that only manifested on a genuinely fresh database. |
| 7 | Diagnose and Fix an Intermittent CI Failure (Race Condition) | A migration test failed only on CI with a unique-constraint violation. Prompted the agent to explain the root cause (parallel test-file execution sharing one database) before fixing it, and required three consecutive full local test runs to confirm the fix was not merely coincidentally passing. |
| 8 | Use E2E Testing to Find a Real UI Bug | While fixing E2E selector mismatches for the Admin screen, the agent discovered — not just a test-selector problem, but a genuine duplicate HTML `id` in `UserManagementScreen.tsx` causing two overlapping error messages on self-deactivation. Had the agent explain the root cause and user-facing impact before accepting the fix, since it was clearly a bug beyond the scope of "making the test pass." |
| 9 | Diagnose Cross-Suite Test Isolation Failure | Adding an E2E job to CI caused Lab 3's authentication test to fail intermittently because it shared a seeded user with Lab 2's E2E suite, which had already changed that user's password. Prompted the agent to identify the shared-fixture conflict and separate the seed data by test purpose, then asked it to confirm Lab 2's original acceptance-criteria coverage was unaffected before accepting the change. |

## My Reflection

Lab 3 reinforced a lesson from Lab 2 even more strongly: the agent's
own verification claims cannot be trusted without independent checking,
especially for security- and data-integrity-critical work. Across this
sprint I caught at least three instances where the agent reported a fix
as complete when it was not — a wrong password hash, a test skipped
rather than passing, and an error-message bug mistaken for a pure test
problem — and in every case the only way to catch it was to run the
verification myself rather than read the agent's summary. I also
learned to be more deliberate about *when* to trust an agent-reported
root cause: asking it to explain user-facing impact and technical cause
before accepting a fix (rather than after) made it much easier to tell
real bug fixes apart from fixes aimed only at making a test green.
