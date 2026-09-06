# Lab 2 — AI Use and Reflection

I used **[ชื่อ AI coding agent เช่น Antigravity]** as the AI Coding Agent for
implementation, and a general-purpose LLM chat assistant as the AI
Specification Agent to draft and refine `specification.md`, `tests.md`,
`ui-spec.md`, and `api-spec.md` before any code was written, per the
Spec-Driven Development requirement of this lab.

## Selected Key Prompts

| # | Prompt Name | What I Did With the Result |
|---|---|---|
| 1 | Draft Sprint Specification | Asked the AI Specification Agent to turn the incomplete stakeholder request into `specification.md`: Sprint Goal, Scope, FR-01–FR-17, BR-01–BR-31 covering all 11 required business-rule areas, UI/Data/API summaries, AC-01–AC-14, Definition of Done, and Assumptions. Reviewed and accepted the drafted assumptions (Ticket Number format, page-size limits, 404-not-403 ownership responses) before implementation began. |
| 2 | Break Sprint into GitHub Issues | Asked the agent to decompose the sprint into 6 dependency-ordered Issues (Spec/Test Plan, Requester Context, Ticket Creation, My Tickets, Ticket Detail+Attachments, E2E/Visual Testing), each with a required branch name and Acceptance-Criteria-based checklist, ready to paste into GitHub. |
| 3 | Draft Test Plan and API/UI Specs | Asked the agent to map every AC-01–AC-14 to at least one concrete test scenario across Unit/API/UI/Style/Responsive/E2E levels in `tests.md`, and to fully specify all 10 REST endpoints in `api-spec.md` and the Zen Green visual system in `ui-spec.md`. |
| 4 | Implement Development Requester Context | Gave the Coding Agent `specification.md`, `tests.md`, `ui-spec.md`, and `api-spec.md` as its contract for Issue 2, and instructed it to flag ambiguities before writing code rather than inventing behavior. It implemented the `RequesterUser` model, idempotent seed, `GET /api/requesters`, and the Selection screen in one pass. |
| 5 | Implement Ticket Creation with Race-Condition-Safe Numbering | Asked the agent to explain its Ticket Number generation and concurrency strategy before accepting the implementation, since two simultaneous submissions could otherwise generate duplicate numbers. |
| 6 | Fix Reviewer Comments (Category isActive) | A partner review found that `GET /api/categories` did not filter by an `isActive` field that did not yet exist on the model. Prompted the agent to add the field via a safe migration (default `true`, preserving existing Lab 1 data) and filter accordingly, while explicitly requiring existing Lab 1 tests to keep passing. |
| 7 | Fix Blocking Concurrency and File-Cleanup Bugs | A partner review flagged an orphaned-file bug on failed authorization and a race condition allowing more than 5 active attachments. Prompted the agent to wrap the count-check-and-insert in a single Prisma transaction and to guarantee file cleanup on any rejection path, and required it to explain the locking strategy before I accepted the fix. |
| 8 | Audit Test Evidence Before Claiming Done | Before marking Issue 6 complete, prompted the agent to fill in `tests.md`'s visual checklist and final results only after actually inspecting the real screenshots — explicitly forbidding checking boxes without verification, in line with the "evaluate completion using traceable evidence" learning outcome. |
| 9 | Regression-Check Every Prior Test Suite After Each Change | After each fix across Issues 2–6, always instructed the agent to re-run and report the full existing test suite (not just new tests), after discovering in Issue 2 that a prior fix had silently reduced a Lab 1 test file from 4 test cases to 2. |

## My Reflection

The biggest lesson from Lab 2 was that "the agent says tests pass" is not
sufficient evidence — twice during this sprint (once in Issue 2, once
suspected in later Issues) the agent reduced or altered existing test
files while fixing something unrelated, which I only caught by explicitly
diffing test files and counting test cases before and after, rather than
trusting the pass/fail summary alone. Writing the full engineering
contract (`specification.md`, `tests.md`, `ui-spec.md`, `api-spec.md`)
before implementation also made peer review much more concrete — most
reviewer comments could be traced directly back to a specific Business
Rule or Acceptance Criterion, which made both giving and receiving
feedback faster than in Lab 1.
