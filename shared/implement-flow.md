# Shared implementation flow

> **Not an invocable command.** Shared include used by `/bond:implement` and
> `/bond:fix-qa`. Each command owns only its unique decisions — which tickets,
> how the branch is chosen, how the plan is built — and calls the procedures
> below for everything they have in common, so the shared logic lives in exactly
> one place. A command lists which procedures it runs, in what order, and the
> inputs it sets; follow the procedure definitions here.

## Autonomy

This flow runs without pausing for the user. Whenever a step would present a
choice or ask the user to pick between viable options — an ambiguous branch,
which of several candidates to use, a scope question with a sensible default —
**do not ask**: pick the best option yourself, act on it, and record it in the
plan file's `## Decisions` section (the options you considered, the one you
chose, and a one-line rationale). Likewise **commit and push automatically**
through the Ship + PR procedure — never ask the user to commit or push, just do
it.

Two things still stop the flow: a genuine blocker where no option is viable
(missing type, error response, no branch found) — surface it and abort/pause as
the procedure says; and the explicit `--no-auto` flag, which pauses once for
plan confirmation (see the Implementation plan procedure). Neither is a
"choose between options" prompt.

## Procedure: Resolve Jira ticket(s)

**Inputs:** `TICKET_IDS` (one or more); `WITH_COMMENTS` (bool).

Resolve the Atlassian `cloudId` once via
`mcp__bond-atlassian__getAccessibleAtlassianResources` (the resource matching
`bonliva.atlassian.net`). For each ticket ID call
`mcp__bond-atlassian__getJiraIssue({ cloudId, issueIdOrKey })` and extract:

- `fields.summary`, `fields.issuetype.name`, `fields.status.name`,
  `fields.priority.name`, `fields.assignee.displayName`
- `fields.description` — Atlassian Document Format; render as plain text
- if `WITH_COMMENTS`: `fields.comment.comments` — full list with author,
  created, body
- `fields.attachment` — for resolving the images referenced below

If any ticket is not found or the tool errors, report which ticket failed and
**abort**.

### Images in the description / comments

Jira embeds images as ADF `media` / `mediaSingle` / `mediaInline` nodes that
reference an entry in `fields.attachment` (match by `id`/`filename`; keep only
`mimeType` `image/*`). For **every** image referenced by the description or, when
`WITH_COMMENTS`, the comments, view it and capture what it shows — mockups, error
screenshots, and diagrams usually carry implementation-critical detail that the
text omits.

To view an image, use the **Chrome MCP** (`bond-chrome-devtools`, the debuggable
logged-in Chrome from `/bond:chrome-debug`). Do **not** navigate to the
attachment's `content` URL directly — that forces a file download which the
browser aborts, yielding no viewable image. Instead, view the image **inline on
the Jira issue page**:

1. `navigate_page` to the Jira **issue page** itself
   (`<JIRA_BASE_URL>/browse/<KEY>`), where the screenshots/diagrams are embedded
   and rendered by the logged-in session.
2. `take_snapshot` to locate the embedded image (the `media` node from the
   description, or the thumbnail under the relevant comment). The snapshot's
   `img` element exposes the **blob link** as its `url`/`src` — a
   `media-cdn.atlassian.com` URL ending in the
   `#media-blob-url=true&id=<MEDIA_ID>&clientId=<CLIENT_ID>…` fragment, e.g.:

   ```
   https://media-cdn.atlassian.com/file/<MEDIA_ID>/image/cdn?…&client=<CLIENT_ID>&token=<TOKEN>&width=…#media-blob-url=true&id=<MEDIA_ID>&clientId=<CLIENT_ID>&contextId=&collection=
   ```

3. **Open that blob link directly in a new tab** — `new_page` with the exact
   `src` read from the snapshot. The CDN serves the full image straight away (it
   redirects to a signed CDN URL), so there is no need to click through Jira's
   media viewer. Bump the trailing `width=`/`height=` query params up (e.g.
   `width=1387`) if the default render is too small to read. Note: the bare
   `blob:<JIRA_BASE_URL>/<uuid>#…` object URL is document-scoped and will **not**
   resolve in a fresh tab — always open the `media-cdn.atlassian.com` `src`,
   which is the fetchable form of the same blob (same `id`/`clientId`/token).
4. `take_screenshot` of the opened image and read it. Then `close_page` the new
   tab.
5. If the snapshot `src` can't be opened directly (missing/expired token), fall
   back to `click`ing the thumbnail to open Jira's media viewer and
   `take_screenshot` there.
6. If the Chrome MCP isn't connected, tell the user to run `/bond:chrome-debug`
   and continue with a text-only note for that image rather than blocking.

Hold each image's description (and which ticket/comment it came from) for the
plan's per-ticket **Images** field.

## Procedure: Transition to In Progress

**Inputs:** `TICKET_IDS`; the `cloudId` resolved above.

For each ticket ID:

1. `mcp__bond-atlassian__getTransitionsForJiraIssue({ cloudId, issueIdOrKey })`.
2. Pick the transition whose `name` contains "in progress" (case-insensitive);
   else one containing "progress" or "start".
3. If found, call `mcp__bond-atlassian__transitionJiraIssue({ cloudId,
   issueIdOrKey, transition })`.
4. Report per ticket. Skip silently if already In Progress (no matching
   transition because it is the current status).
5. If the transition call fails, surface the error but **do not abort**.

## Procedure: Set up the branch

**Inputs:** `BRANCH_NAME`; `BRANCH_SOURCE` = `new` (cut off `origin/main`) or
`existing` (attach to an already-pushed branch); `WORKTREE_SUFFIX` (empty for
`/implement`, `-qa` for `/fix-qa`); mode = worktree (default) or in-place
(`--no-worktree`).

### Worktree mode (default)

Do **not** require a clean working tree.

1. Repo name: `basename "$(git rev-parse --show-toplevel)"`.
2. Slug: `BRANCH_NAME` with `/` replaced by `-`.
3. Worktree path: `../<repo>-<slug><WORKTREE_SUFFIX>` (sibling to the repo).
   Record this path **and** the original repo directory — the Teardown procedure
   needs both.
4. `git fetch origin`.
5. Create the worktree:
   - `BRANCH_SOURCE=new`: `git worktree add -b <BRANCH_NAME> <path> origin/main`.
     Abort if the path or branch already exists.
   - `BRANCH_SOURCE=existing`: `git worktree add <path> <BRANCH_NAME>` when a
     local branch exists, or `git worktree add -b <BRANCH_NAME> <path>
     origin/<BRANCH_NAME>` when only a remote branch exists. Abort on
     path/branch conflicts.
6. `cd` into the worktree. All later procedures run inside it.
7. `BRANCH_SOURCE=existing` only: `git pull --ff-only origin <BRANCH_NAME>` to
   fast-forward. Abort on failure — do not auto-merge or rebase. (`new` is
   already at the `origin/main` tip.)
8. Confirm: worktree path, branch name, short SHA of the tip.

### In-place mode (`--no-worktree`)

1. `git status --porcelain` must be clean — otherwise tell the user to commit or
   stash and **abort** (do not auto-stash).
2. Sync and switch:
   - `BRANCH_SOURCE=new`: `git fetch origin && git checkout main && git pull
     --rebase origin main`, then `git checkout -b <BRANCH_NAME>`.
   - `BRANCH_SOURCE=existing`: `git fetch origin && git checkout <BRANCH_NAME> &&
     git pull --ff-only origin <BRANCH_NAME>`.
   Abort on failure.
3. Confirm: branch name and short SHA.

## Procedure: Analyse the codebase

**Inputs:** `FOCUS` — the ticket descriptions/acceptance criteria
(`/implement`) or the selected QA feedback items (`/fix-qa`).

Explore the code relevant to `FOCUS`:

- Search for files, components, and services tied to the focus (use file names,
  symbols, and route paths it mentions).
- Identify which files need to change and why.
- Locate related backend API endpoints and DTOs if data is touched.
- Find existing tests covering the affected area.

## Procedure: Implementation plan

**Inputs:** `PLAN_FILE` = `docs/plans/<TICKET_IDS>.md` (create `docs/plans/` if
absent); `PLAN_MODE` = `write` or `append`; for `append`, the dated section the
caller supplies; `MODE` (`auto`/`no-auto`); `CONFIRM_PROMPT`.

Base structure — used to create a fresh plan, and when an `append` target file
is missing:

```
# <branch-name>

## Tickets
For each ticket:
- **<ID>: <summary>** (`<type>` · `<status>` · `<priority>`)
  - Description: <full plain-text body>
  - Acceptance criteria: <extracted from description>
  - Images: <for each image in the description/comments — `<filename>`: what it
    shows and the detail relevant to implementation; omit the field if none>
  - Open questions: <ambiguities or decisions flagged>

## Files to change
- `<path/to/file>` — <one-line reason>

## Implementation steps
1. <Concrete step>
2. ...

## Tests
- `<test file path>` — `<describe> > <it>` — <what it asserts>

## Decisions
Choices made autonomously during the flow (see **Autonomy**):
- <decision>: considered <options>; chose <selected> — <why>.
```

- `PLAN_MODE=write`: create `PLAN_FILE` with the base structure filled in.
- `PLAN_MODE=append`: locate `PLAN_FILE` (`docs/plans/<TICKET_ID>_*.md` also
  matches multi-ticket branches). If it is missing, first create it with the
  base structure. Then **append** the caller's dated section at the end — never
  overwrite.

As the flow proceeds, log every autonomous choice point under `## Decisions`
(for an `append` round, under that round's `### Decisions`) — including any
choice already made before this procedure runs (e.g. branch selection). Leave
the section empty (or omit the bullet) if nothing was chosen.

Print the full plan (write) or the appended section (append) to the user.

In `auto` mode, skip confirmation and note that auto-confirm is enabled. In
`no-auto` mode, ask `CONFIRM_PROMPT` and wait for explicit confirmation; if the
user requests changes, update the plan and ask again before proceeding.

## Procedure: Implement

**Inputs:** `SCOPE` — what to implement: the whole plan (`/implement`) or only
the newest `## QA fix round` section (`/fix-qa`).

Execute the implementation steps within `SCOPE` in order. After each logical
group of changes, briefly say what was done and which files were modified.

- Do **not** commit — leave staging and committing to the user or
  `/bonliva-dev:ship`.
- If something blocks a step (missing type, unexpected API shape, etc.), pause
  and ask the user rather than guessing.

## Procedure: Test

**Inputs:** `SCOPE` (as above).

Write the tests listed in the plan's **Tests** section that fall within `SCOPE`:

- Co-locate tests with the code they test (e.g. `*.spec.ts` next to the
  service/controller, `*.test.tsx` next to the component).
- Follow existing test patterns in the same module — do not introduce a new
  testing style.
- Cover the golden path and at least one edge/error case for each new behaviour.
- Do not write tests for code that was not changed.

## Procedure: Report completion

**Inputs:** `WORKTREE`, `MODE`, `PLAN_FILE`.

Tell the user:

- Branch and where it was cut from / attached to.
- Worktree path, unless `WORKTREE` is `none`.
- Tickets handled: `<ID>: <summary>` for each.
- Plan file: `PLAN_FILE`.
- Files changed: brief list.
- Next step: in `auto` mode the Ship + PR and Teardown procedures run
  automatically; in `no-auto` mode, tell the user to run `/bonliva-dev:ship` to
  validate, commit, and push.

## Procedure: Ship + PR  *(auto mode only — skip entirely when `MODE` is `no-auto`)*

**Inputs:** `PR_HANDLING` = `create` or `update`.

Commit and push happen here automatically — do not ask the user first.

1. Run `/bonliva-dev:ship` to validate, commit, and push the branch.
2. Then, by `PR_HANDLING`:
   - `create` → invoke `/bond:open-pr` to create the Bitbucket PR.
   - `update` → the ship push updates the existing PR. Check for an existing PR
     for this source branch via `mcp__bond-bitbucket__get_pull_requests`. If one
     exists, print its URL and do **not** invoke `/bond:open-pr`. If none exists,
     invoke `/bond:open-pr` to create it. Do **not** re-ping reviewers on a QA
     round — just tell the user they can run `/bond:request-review` if they want
     to.

If either step fails, surface the error and stop — do not retry blindly, and do
**not** proceed to Teardown (leave the worktree in place so the user can fix and
resume).

## Procedure: Teardown  *(auto mode only — skip when `MODE` is `no-auto` or `WORKTREE` is `none`)*

**Inputs:** `WORKTREE` (recorded worktree path + original repo directory).

Only runs when a worktree was created **and** Ship + PR completed successfully.

1. `cd` back to the original repo directory recorded during branch setup.
2. `git worktree remove <worktree-path>`. If it reports the worktree is dirty or
   has untracked files, do **not** force-remove — surface the warning and leave
   the worktree for the user to inspect.
3. Confirm the worktree was removed. The branch still exists locally and on
   `origin`.

## Do NOT

- Do not commit anything yourself in `no-auto` mode. In `auto` mode, committing
  is delegated to `/bonliva-dev:ship`.
- Do not push the branch yourself in `no-auto` mode — tell the user to run
  `/bonliva-dev:ship`.
- Do not force-remove a dirty worktree — surface the warning instead.
- When `PR_HANDLING` is `update`, do not open a second PR and do not auto-ping
  reviewers.
