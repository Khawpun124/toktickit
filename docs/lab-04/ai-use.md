# Lab 4 — AI Use and Reflection

I used **Antigravity (running on a Claude Code account)** as the AI
Coding Agent for implementation and **Claude (Anthropic)** as the AI
Specification Agent. Claude drafted `specification.md`, `tests.md`,
`ui-spec.md`, and `api-spec.md` before any code was written, wrote the
step-by-step prompts for the coding agent, and helped me read review
comments and test results, continuing the Spec-Driven Development
approach of Labs 2 and 3. Model versions: [รุ่นของ Claude ที่ใช้ และรุ่นของโมเดลที่ Antigravity ใช้].

## Selected Key Prompts

| # | Prompt Name | What I Did With the Result |
|---|---|---|
| 1 | Draft the Lab 4 Specification, Test Plan, and Contracts (Spec Agent) | Asked Claude to turn the lab sheet into `specification.md`, `tests.md`, `ui-spec.md`, and `api-spec.md`, with every acceptance criterion traced to a test. The first drafts had contradictions between the API and UI contracts and too little detail on migration and rollback; the partner reviews and my own reading found them, and I fixed them in separate commits. Final contract: 24 FR, 39 BR, 38 AC, 104 test rows. |
| 2 | Read-Only Checkpoint Before Coding ("CP0") | For Issues 2 to 7 I told the agent to read the real code and the existing tests, report findings with file and line numbers, and stop without writing code. Each time it found places where the contract did not match reality (the Lab 2 list accepted only `NEW`, no hamburger menu ever existed, Lab 3 tests pinned `window.confirm` and a two-argument `setTicketStatus`). I changed the contract first, in its own commit, and only then let the agent code. |
| 3 | Rehearse Upgrade, Rollback, and Restore on a Real Lab 3 Database | My first evidence came from tests in one process, and the reviewer rejected it. I prompted the agent to build a Lab 3 database with the released Lab 3 app over HTTP (no SQL), upgrade by the README literally, roll back with 117 real Actions, restore from backup, and upgrade again. I checked the sha256 of 34 Lab 3 responses before and after each step and asked for two extra conditions (a write smoke test after rollback, and the same checks again after the whole cycle). |
| 4 | Chase Conditions the Agent Silently Skipped (Issue 3) | The agent reported a checkpoint as finished but had not done three conditions I set (the `act()` warning, a retry test for `clientRequestId`, the check for unhandled rejections); I noticed because the test counts had not changed. I prompted it to do them and say why. It found the real cause of the warning (a focus move caused by a confirmation dialog updated form state outside the test's `act()`), fixed it in the component, and added the retry test, instead of hiding the console output. |
| 5 | Decide Between Changing the Contract and Changing Old Tests (Issue 5) | Three existing tests broke because my draft contract said every role lands on its dashboard after login. I read the lab sheet, found it does not require that for Requesters, and told the agent to keep the Requester landing page and not edit any old test. The agent proved the wiring by removing it temporarily and watching new tests fail, then restoring it. |
| 6 | Keep Server Logs Safe (Issue 6) | I suspected Prisma error messages include the arguments of the query (an e-mail or a password hash). I prompted the agent to check real messages (a duplicate e-mail, a validation error) and log only the error name, the Prisma code, and the last line of the message cut at 300 characters; a test with a real P2002 error proves the e-mail and the hash are not logged. |
| 7 | Test Every Important Form and Run the Real Server (Issue 6 review) | After the reviewer asked for proof, I had the agent write a table-driven test over 12 forms and then start the real server in `production` and `development` and send 20 requests (bad JSON, oversized body, unknown path, unreadable charset, database stopped). The test found a real defect (the Admin create-user form kept its values after success), and the runtime run found one answer the contract did not list (415), which I added to the contract. |
| 8 | Accessibility Gate Without Escape Hatches (Issue 7) | I forbade fallbacks, `test.skip()`, fixed sleeps, and disabling or filtering axe rules, and told the agent to stop and show me any serious finding instead of fixing the client by itself. Axe found 21 serious findings per screen size (contrast below 4.5:1 and card names that did not contain their visible text); I approved the fixes, and the new numbers were measured again (contrast 6.11 to 6.29; 0 serious findings). |
| 9 | Make Screenshots Reproducible (Issue 7) | Twelve to 21 of the 48 screenshots changed on every run. I prompted the agent to replace masks with fixed stand-in text, use viewport captures for dialogs and toasts, and compare all 48 files byte by byte over repeated runs without using `git restore` to hide differences. It also needed software rendering flags for anti-aliased corners; the result is 0 changed files over four runs. Looking at the images also exposed two real defects (a clipped table button and a toast covering headings). |
| 10 | Capture Only Real Report Images | For the report I told the agent never to fake, edit, or composite an image, to look at every picture and compare it with what must be visible, and to keep browser-console and terminal evidence as real text transcripts. It listed what it could not do (the native `window.confirm` box, GitHub pages that need my login). |

## Where the AI Was Wrong

| Who | Mistake | How It Was Caught |
|---|---|---|
| Spec Agent | Contract described a hamburger menu that never existed, and a Lab 2 status filter that accepted more than `NEW`; two parts of the contract disagreed about the 503 body | The coding agent's read-only checkpoint, then my reading of the code |
| Spec Agent | Told me the Requester screen shows a "Ticket not found" page; it redirects to My Tickets with a banner | The agent captured the real behavior while preparing report images |
| Coding Agent | Skipped three conditions and reported the work as done (Issue 3) | The unchanged test counts |
| Coding Agent | Reported that two text areas had no label; they already had one | `tsc` complained about the duplicate attribute |
| Coding Agent | Missed that three old client tests would break on the new landing page | Running the full old suites on the new code |
| Both | Screenshots that "looked stable" changed between runs | Comparing bytes of all 48 files |
| Me | Forgot to commit the `tests.md` change that marks rows Pass after four merges | I now open the PR's Files changed tab before every merge |

## My Reflection

Lab 4 repeated the lesson of Labs 2 and 3, and the lesson got more
specific: an AI agent is most useful when I split the work into
checkpoints and make it prove each step with something I can run. The
read-only checkpoint before coding paid for itself in every Issue,
because it moved the arguments about the contract to before the code
existed, where changing a document costs minutes instead of days. Asking
the agent to remove a piece of wiring and watch a test fail was a better
proof that a feature is connected than any summary it wrote.

The agents were wrong in predictable ways. The Specification Agent wrote
contracts that sounded complete but assumed things about code it had not
read; the Coding Agent sometimes skipped a condition or reported a check
it had not done properly. In every case what caught the error was
running or reading something myself: the full suites, a byte comparison,
a real server, the images. If I did this lab again I would open the
GitHub Issue for the flaky E2E helper in the first week instead of
carrying it to the end, ask the agent to rerun the old test suites during
a change and not only at the end, and check the Files changed tab for
`tests.md` before every merge.
