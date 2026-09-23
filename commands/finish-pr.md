---
description: After /bond:implement or /bond-bonliva:fix-qa — test the change in a real browser, tick the PR's test plan, mark it ready, then loop review → fix → CI → conflicts until only a human approval is left
---

# /bond:finish-pr

The step after the code is written. `/bond:implement` and `/bond-bonliva:fix-qa`
end with a pushed branch and an open PR; this command takes that PR the rest of
the way to *waiting only on a human's approval*:

1. **Verify** — run the app, walk every flow the change touches, check the markup
   is not broken, and tick the PR's **Test plan**.
2. **Mark ready** — only when step 1 passed.
3. **Review loop** — wait for review, fix what is relevant, wait for CI, fix it if
   red, resolve merge conflicts when the base moves; a new review after a push
   starts the loop again.

It never merges, never approves, never moves the Jira ticket, and never pings a
human.

It reuses the procedures in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`
(branch setup, Implement, Test, Review and fix, Teardown) and
`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md` (PR coordinates, CI status).
Review-thread reads, replies and resolution follow
`${CLAUDE_PLUGIN_ROOT}/plugins/bond-bonliva/commands/babysit-prs.md` steps 4
and 6 — thread state and resolution are GraphQL-only on GitHub, and that file
has the queries.

**Standing instructions win.** An instruction the user gave earlier in the
session — "skip review", "don't push", "don't post comments" — overrides the
matching step here for the rest of the run.

## Arguments

`$ARGUMENTS` — optional PR number or URL (either host), plus flags. No PR ⇒ the
open PR whose head is the current branch; none found ⇒ say so and stop (run
`/bond:open-pr` first).

### Flags

| Flag | Effect |
| --- | --- |
| `--url <url>` | App URL to test against. Default: the dev server step 1 starts or finds. |
| `--skip-browser` | Skip step 1's run-through — for a change with no runtime surface. Recorded in the test plan as *not verified locally*. |
| `--no-ready` | Stop after step 1: tick the test plan, leave the PR a draft. |
| `--skip-review` | Step 3 waits for CI only, not for a review. |
| `--rounds N` | Maximum review/CI fix rounds in step 3 (default `3`). |
| `--review-timeout M` | Minutes to wait for a review before exiting (default `30`). |

## The ledger

`~/.claude/bond/finish-pr-<OWNER>-<REPO_SLUG>-<n>.json` — outside the repo and
the session scratchpad, so a re-run continues instead of redoing:

```json
{ "rounds": 1, "handledCommentIds": [123], "handledThreadIds": ["PRRT_…"],
  "failedCauses": { "<root cause>": 1 }, "mergedBase": "<base sha>",
  "testPlan": "passed | partial | failed" }
```

A comment is new when its id is not in `handledCommentIds` — **never** by
timestamp alone: a review bot edits its summary comment in place, and a
re-review in the same area arrives under a new id with a new finding.

## Steps

### 0. Resolve the PR

1. Resolve the PR from the **URL when one is given**, not from the current
   directory. A URL for another repo ⇒ find that repo's checkout under
   `~/Documents/projects/` and work there, or stop and say which repo is
   missing.
2. Resolve the project profile, then **Resolve PR coordinates** and **PR
   details and CI status**. Re-read them by PR number whenever this run needs
   them — never reuse a head SHA across a push or rebase.
3. `MERGED` / `CLOSED` / `DECLINED` ⇒ stop.
4. Before any write, apply `bond:authorship-conventions`: the active `gh`
   account must be the one for this repo, and `git ls-remote origin` must
   succeed — switching `gh` does not switch the SSH key, so "Repository not
   found" after a switch is the key, not the account.
5. **Set up the branch** with `BRANCH_NAME` = the PR head,
   `BRANCH_SOURCE=existing`, `WORKTREE_SUFFIX=-finish`. When the head is already
   checked out — here, or in an `/implement` worktree that was kept — work in
   that checkout (`git worktree add` refuses a branch checked out elsewhere).
   Never share a checkout another session is using: a branch switch there lands
   this run's commits on the wrong branch. Any subagent this run spawns gets the
   absolute checkout path and must write only inside it.
6. The local head must equal the PR's head commit. Behind ⇒ `git pull
   --ff-only`. Ahead or diverged ⇒ **stop**: unpushed local work is the user's.
7. Read what defines *done*: the PR body's `## Test plan`, the plan file
   (`docs/plans/<KEY>.md`, or the branch slug), and under `TRACKER=jira` the
   ticket's acceptance criteria and any Figma link. Read the ticket; do not
   transition it.
8. The PR conflicts with its base ⇒ run **Resolve merge conflicts** now, before
   step 1 — verifying code that cannot merge verifies the wrong thing.

### 1. Verify

**a. Classify the surface.** From the diff:

| Surface | How it is verified |
| --- | --- |
| web UI | browser — the rest of this step |
| native mobile (React Native, iOS, Android) | simulator/emulator: `xcrun simctl io booted screenshot`, `adb exec-out screencap -p`. A physical iPhone has no screenshot path — ask the user for one. |
| backend with a UI caller | through that UI |
| backend with no UI caller | its HTTP endpoint (`curl`), stating the request and response |
| none (docs, tests, CI config, lockfiles) | skip to 1f, recorded as *no runtime surface* |

**b. Build the checklist.** One item per flow, merged from the PR's test plan,
the plan file's steps and tests, and the acceptance criteria. Add what the diff
implies but nobody listed: the error path, the empty state, a second role, and
every **shipped locale** where the change adds or moves copy. A flow is a
user-visible path from entry to result, not a unit assertion.

**c. Get the app running.** Most "the feature is broken" moments in this step
are really the environment. Rule these out first, in order:

1. **Install works** — `npm ci`/`pnpm i` returning 401/403 is registry auth or
   the wrong token, not the code.
2. **Env** — diff `.env` against `.env.example`; a missing required var blocks
   boot. Copy non-secret defaults; a missing secret ⇒ stop and ask.
3. **Right server, right code** — a server already listening may be an orphan
   from another branch or from the main checkout, hours old
   (`lsof -iTCP -sTCP:LISTEN -P`, then `ps -o etime= -p <pid>` and its cwd).
   Reuse it only if it serves **this checkout**; otherwise kill it and start one
   from here. After a branch switch clear the framework cache (`.next`,
   `.turbo`, `node_modules/.vite`) — a stale Turbopack cache serves the old UI.
4. **Right port** — a monorepo runs several apps; take the port from the env
   file or the app config and confirm it with a health-check `curl`, never by
   assumption. Start only the apps the diff touches plus what they call.
5. **Data** — a fresh worktree or empty DB has no seed: run the repo's
   migrate/seed script. A flow driven by a poll, webhook, push notification or
   job needs a local trigger — a DB insert, the repo's send/trigger script —
   rather than waiting for the real one.
6. **Feature flags** — find how the flag is defined (DB config, env, compile-time
   constant) and what state the ticket wants. A flag the ticket keeps **off** is
   verified off; do not flip it to "see" the feature. DB-backed flags may be
   client-cached for minutes — reload after changing one.
7. **Generated code** — after any merge from base, regenerate generated clients
   (OpenAPI SDK and the like) instead of trusting a hand-merged copy.

Never point the app at production data or guess credentials.

**d. Sign in.** Drive the app's own sign-in before testing — an auto-signin
redirect (`/auto-signin?redirect=…`) means no session yet; confirm a session
cookie. BankID, other e-ID, SMS/OTP and SSO MFA cannot be automated: **do not
open a BankID link**. Ask the user to sign in in the browser once, or mark the
items behind it *manual only*.

**e. Drive it.** Load the `anthropic-skills:chrome-browser` skill and use
`claude-in-chrome` in a new tab; `/bond:chrome-debug` is the fallback. Mechanics
that bit before:

- Open the console and network readers **before** navigating — attached after,
  they report nothing until a reload.
- Batch navigate/click/type/read into one `browser_batch` call where the steps
  do not depend on each other's output.
- Wait for the page to settle: "script injection timed out … mid-navigation" ⇒
  wait, retry once. A flash of the empty state while a query is still disabled
  is a loading race, not the result — wait for the real loading indicator to
  clear.
- Per `bond:context-cost`: read the page as text or accessibility tree; take a
  screenshot only where the question is visual.
- In-app confirm dialogs are fine to click. A native `alert`/`confirm`/
  `beforeunload` wedges the extension — do not trigger one (closing a tab with
  an unsaved form does).

For each checklist item, walk it end to end including error and empty paths,
and check:

- **Console** — no new errors or unhandled rejections on the path.
- **Network** — no unexpected 4xx/5xx from the calls the path makes.
- **Markup** — at desktop (1440) and mobile (375) widths:
  - no horizontal page overflow (`scrollWidth > clientWidth` on `<html>`), no
    clipped, truncated or overlapping text, no element escaping its container;
  - every shipped locale, reading the **literal rendered string** — a label
    that fits in English can truncate in Swedish at the same width;
  - realistic-length data — long names and addresses expose truncation short
    seed values hide;
  - no raw i18n keys, `undefined`/`NaN`/`[object Object]`, no broken images;
  - dark mode when the app has one; the Figma frame when one is linked — no
    missing or misplaced elements, not pixel-exact.

A failure ⇒ first check it on the base branch. Fails there too ⇒ pre-existing:
note it, do not fix it here. Otherwise it is this PR's bug: **Implement** →
**Test** → **Review and fix** (`SCOPE` = the failures), commit, push, re-verify
the failed items **and** the ones sharing code with the fix. Two failed attempts
on the same item ⇒ stop and report.

**f. Update the test plan.** Rewrite only the `## Test plan` section of a
**freshly read** PR body (a bot may have appended since) — `gh pr edit <n>
--body-file` on GitHub, the update-PR call on Bitbucket. Items stay plain UI
steps a QA tester can follow — never a CLI or test command:

- `- [x]` passed, with how: `(checked 1440 + 375, en + sv)`, `(API: POST /x → 201)`;
- `- [ ]` + one-line reason for what could not be verified locally (e-ID sign-in,
  a third-party webhook, no staging). Never tick an item that was not run.

An unticked item on the golden path blocks step 2; elsewhere it does not.

### 2. Mark ready

Skip under `--no-ready`, or when the PR is already not a draft. Marking ready is
what triggers the review bot on repos that review on `ready_for_review`.

- GitHub: `gh pr ready <n>`.
- Bitbucket: the MCP's publish-draft / update-PR call. None available ⇒ tell the
  user to publish it by hand and continue.

Record the time as `SINCE`. Re-check the draft state after any later
force-push — a rebase can flip it.

### 3. Review → fix → CI loop

Each iteration is one **round**; stop after `--rounds`, counted in the ledger.

**a. Wait** — first, if the base moved and the PR now conflicts (GitHub
`mergeable: CONFLICTING`; on Bitbucket the local trial merge below), run
**Resolve merge conflicts** and push before waiting: CI does not run, and bots
do not review, a PR that cannot merge. Then wait in the background — a `run_in_background` loop or the Monitor tool,
never a foreground poll — until **both** settle:

- **CI** — **PR details and CI status** reads **passed** or **failed**. Read the
  check runs themselves: GitHub's `mergeStateStatus: BLOCKED` usually just means
  checks are still running on the new head. No checks at all after 5 minutes ⇒
  no CI for this branch: say so, treat as passed. On Woodpecker, use the
  `bond:woodpecker-cli` skill.
- **Review** — skipped under `--skip-review`. A review, review thread, or
  conversation comment whose id is not in the ledger, from anyone but the PR
  author — or `--review-timeout` minutes. The bot seen in practice is Qodo /
  PR-Agent (`github-actions[bot]`, "PR Reviewer Guide", or a
  `codiumai/pr-agent` pipeline step on Bitbucket); it re-reviews on its own a
  few minutes after every push, so do not ping it. A human may take days: the
  timeout is an exit, not a failure.

A review of `APPROVED` with nothing new is a pass for this round.

**b. Triage the review.** Per the `superpowers:receiving-code-review` skill:
verify each claim against the code — bot reviews are routinely half right, so
verify every numbered finding independently, with evidence (read the code, run
the query plan, run the test). Before treating a finding as new, check it
against what **Review and fix** already handled this run. Weigh "security"
findings in test code lightly. Per finding, exactly one of:

- **fix** — correct and in scope ⇒ change it.
- **decline** — wrong or already handled ⇒ answer with the evidence
  (`file:line`, the covering test). Leave the thread open for the reviewer.
- **needs you** — a product/design question or out of scope ⇒ leave it, list it
  in the report.

Skip outdated and resolved threads, approvals, bot summaries, CI status noise.

**c. Fix CI** — when **failed**: run `/bond:fix-pr` step 3 (diagnosis only),
then:

- also red on the base branch ⇒ not this PR's; note it.
- flaky suspect ⇒ `gh run rerun <id> --failed` once before debugging; green on
  rerun ⇒ note it, do not "fix" it.
- infrastructure, not code — registry 401 across hosts, leftover Woodpecker
  `buildx_buildkit_*`/`wp_*` containers, a runner that never picked the job up
  ⇒ report under *Needs you*.
- otherwise fix the root causes here. The same cause failing twice
  (`failedCauses`) ⇒ stop.

**d. Ship the round.** **Test**, then **Review and fix**, then commit per
`bond:authorship-conventions` and `git push`:

- One commit per concern — review fixes, CI fixes, and anything unrelated the
  user asked for go in separate commits. Comment-hygiene deletions ride only in
  code the round already touches.
- Never `[skip ci]` — on GitHub it suppresses every later run on the PR,
  `ready_for_review` included, until another commit lands.
- Never `--force`; `--force-with-lease` only after a rebase (see **Resolve
  merge conflicts**).
- A fix that touches UI ⇒ re-run step 1 for the affected items and update the
  test plan before pushing.
- Push failed ⇒ stop with the worktree intact.

Then answer the review:

- **bot** — reply to each fixed finding naming the commit, resolve its thread
  (GraphQL `resolveReviewThread`), reply to declined ones with the evidence.
- **human** — push the fix, but do not reply to or resolve their threads: put
  the drafted replies in the report for the user to post.

Record handled ids in the ledger. No CI-status comments on the PR, ever.

**e. Next.** Pushed anything, or CI still running ⇒ `SINCE` = the push time, loop
to 3a. Otherwise settled — exit.

Exit, whichever comes first: settled (CI passed, nothing new to address, nothing
pushed this round); `--rounds` exhausted; a stop from 1e/3c/3d; the PR merged
or closed meanwhile; a conflict **Resolve merge conflicts** handed back.

### Resolve merge conflicts

Called from step 0.8 and step 3a.

**Detect.** GitHub: `gh pr view <n> --json mergeable,mergeStateStatus` —
`UNKNOWN` is still computing, re-read it; still unknown, fall through to the
trial merge. Everywhere, and the only way on Bitbucket:

```sh
git fetch origin <BASE_BRANCH>
git merge --no-commit --no-ff origin/<BASE_BRANCH>
git diff --name-only --diff-filter=U        # the conflicted files
```

Clean ⇒ `git merge --abort` unless the branch is also `BEHIND` a base that
requires up-to-date branches, in which case commit the clean merge.

**Merge, don't rebase.** Merge `origin/<BASE_BRANCH>` into the branch: no
force-push, review threads stay anchored to their commits, and the draft state
cannot flip. Rebase instead only when the base's branch protection requires a
linear history (`gh api repos/<OWNER>/<REPO_SLUG>/branches/<BASE_BRANCH>/protection`
→ `required_linear_history`) or the user asked for it — then push
`--force-with-lease` and re-check the draft state.

**Resolve by file kind** — never take `--ours` or `--theirs` wholesale on code:

| Kind | Resolution |
| --- | --- |
| generated (OpenAPI/GraphQL clients, `*.gen.*`, ORM clients) | take the base side, then regenerate from the merged sources — never hand-merge generated code |
| lockfile | take the base side, then re-run install so this branch's dependency changes are re-applied |
| migrations | keep both sides' migrations; when their order or numbering collides, renumber or re-timestamp **this branch's** migration, never the base's, and apply both to a fresh DB |
| i18n / keyed JSON | union of keys; a key both changed keeps the base value unless this PR changed it on purpose |
| changelog / version | base version, plus this branch's entries |
| code | read both intents — the base commit behind the hunk (`git log -p origin/<BASE_BRANCH> -- <file>`) and this PR's plan — and write the version that keeps both |
| deleted or moved on base, modified here | port this branch's change to where the code now lives |

**Hand back instead of guessing.** When both sides rewrote the same logic
differently and the plan does not say which wins, or the base deleted what this
PR builds on: `git merge --abort` (or `git rebase --abort`), and report the
files and both commits under *Needs you*. That is a stop.

**Prove it.** Before committing:

1. No markers left — `git diff --check` and a search for `<<<<<<<` / `>>>>>>>`
   in the conflicted files.
2. Typecheck and build, then **Test** and **Review and fix** scoped to the
   resolved hunks.
3. Re-run step 1 for every checklist item whose code the resolution touched,
   and update the test plan.

Commit with git's own `Merge …` subject (the commit hook passes it), push, and
record the base head the merge was made against in the ledger. A second
conflict on the same base head means the resolution was wrong — stop.

### 4. Teardown and report

Run **Teardown** only after the last push is confirmed on the remote
(`git ls-remote origin <branch>` equals local `HEAD`) — never before, or the fix
goes with the worktree. Then print:

- PR #, URL, draft → ready (or why not).
- Test plan: passed / manual only / failed, widths and locales checked.
- Per round: findings fixed / declined / needs you, CI verdict, commit shas.
- **Needs you** — findings left alone, drafted replies to human reviewers,
  pre-existing and infrastructure failures, every stop reason.
- Final state: CI, review decision, unresolved threads. Merging is the user's.

## Do NOT

- Do not mark a PR ready whose golden path failed or was not verified, and do
  not tick a test-plan item that was not run.
- Do not merge, approve, dismiss a review, re-request review, or transition the
  ticket.
- Do not resolve a thread you did not fix; do not reply to or resolve a human
  reviewer's thread.
- Do not push local commits that were not already on the PR when it started.
- Do not force-push a branch this run did not rebase, and do not use
  `[skip ci]`.
- Do not take `--ours`/`--theirs` wholesale on code, hand-merge generated files,
  or renumber the base's migrations.
- Do not open a BankID link, guess credentials, or test against production.
- Do not flip a feature flag the ticket keeps off.
- Do not fix a pre-existing, flaky or infrastructure failure as if this PR
  caused it.
- Do not poll in the foreground, post CI-status comments, or echo whole CI logs
  and comment threads.
- The shared flow's own **Do NOT** list applies.
