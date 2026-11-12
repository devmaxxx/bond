# Shared project profile

> **Not an invocable command.** The single place a bond command works out _what
> kind of repo it is standing in_. Every command that touches a host, a base
> branch, an issue tracker, reviewers or a chat channel resolves this profile
> first and reads the answers off it — no command hardcodes a workspace, a base
> branch or a reviewer list.

A repo with no `.bond/project.json` gets the generic profile: GitHub, the
remote's default branch, no tracker, no drafts, GitHub's own reviewers.

## Resolve the profile

Run once per command invocation, before any step that needs a host or a base:

```sh
git remote get-url origin
git symbolic-ref --quiet --short refs/remotes/origin/HEAD
```

Read `.bond/project.json` at the repo root if it exists. Every field below is
optional; a field that is present **wins over every inferred value**, because
the repo's own statement about itself beats a guess made from its URL.

```json
{
  "tracker": "none",
  "jiraSite": "example.atlassian.net",
  "baseBranch": "main",
  "branchModel": "trunk",
  "developBranch": "develop",
  "productionBranch": "main",
  "reviewers": [],
  "draft": false,
  "prTitle": "plain"
}
```

Never invent this file silently. Offer to write it when a command had to guess
and the guess mattered.

## Fields

### `HOST` — where pull requests live

GitHub, through `gh`. The `origin` URL must be `github.com` or a `github-*` SSH
alias. A repo with several remotes resolves `origin`, not the first remote
listed — `git remote -v` sorts alphabetically, so the fork you push to may not
be the one printed first.

`origin` is not on GitHub ⇒ report it and stop. A PR opened against the wrong
host is not recoverable by editing it.

### `OWNER` and `REPO_SLUG`

The path segments of the `origin` URL. `https://github.com/devmaxxx/repograph.git`
→ owner `devmaxxx`, slug `repograph`.

### `DRAFT` — does a PR open as a draft?

`draft` in the manifest, else `false`: a PR opens ready for review. A repo that
wants drafts sets `"draft": true`. `hooks/check-pr.mjs` enforces the resolved
value.

### `BASE_BRANCH` — what a PR targets, and what a branch is cut from

First match wins:

1. An explicit `--base` argument on the command.
2. `baseBranch` in `.bond/project.json`.
3. The remote's own default branch:
   `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` (strip the
   `origin/` prefix). Run `git remote set-head origin --auto` first if it is
   unset.
4. `main`.

### `BRANCH_MODEL` — `trunk` or `gitflow`

`branchModel` in the manifest, else **`trunk`**: every branch is cut from, and
its PR targets, `BASE_BRANCH`.

Under `gitflow` the branch's type picks its base instead of steps 2–4 above
(an explicit `--base` still wins):

- `feat`, `fix`, `chore`, `docs`, `release` ⇒ `DEVELOP_BRANCH` —
  `developBranch` in the manifest, else `develop`;
- `hotfix` ⇒ `PRODUCTION_BRANCH` — `productionBranch` in the manifest, else
  `main` when `origin/main` exists, else `master`.

The branch names keep the Conventional Branch prefixes of the
`authorship-conventions` skill; only the bases follow git-flow. A repo with an
`origin/develop` and no `branchModel` is a guess, not git-flow: a command
that cuts a branch asks once and offers to write the answer here.

### `PR_TITLE` — `plain` or `conventional`

`prTitle` in the manifest, else **`plain`**: a sentence led by its issue, per
`shared/pr-template.md`. `conventional` is for a repo whose squash commit takes the PR
title as its subject and whose CI checks it — the title is then a Conventional Commits
subject, and `hooks/check-pr.mjs` enforces whichever the profile says.

### `TRACKER` — `jira` or `none`

`tracker` in the manifest, else **`none`**.

`TRACKER=none` is a first-class path, not an error. Under it:

- Commands take a free-text description where they would take a ticket key.
- No issue is fetched, created, claimed or transitioned; nothing is commented.
- `<tickets>` is empty, so `shared/pr-template.md` omits its `## Jira` section
  and the PR title carries no key prefix.
- The branch description comes from the work itself:
  `<type>/<short-hyphenated-description>` per the `authorship-conventions` skill,
  not the `<type>/<KEY>` shape bond uses under `TRACKER=jira`.
- A plan file is named after the branch description rather than the ticket.

### `JIRA_SITE` — which Atlassian site, under `TRACKER=jira`

`jiraSite` in the manifest (`<name>.atlassian.net`), else the only site
`getAccessibleAtlassianResources` returns. Several sites and no `jiraSite` ⇒
ask which one, and offer to write it into `.bond/project.json`.

`TICKET_KEYS` under `TRACKER=jira` are the configured Jira project keys — see
`BOND_JIRA_PROJECTS` in `shared/pr-template.md`. A token that is not one of
those keys is free text, not a ticket.

### `REVIEWERS`

1. `reviewers` in `.bond/project.json`.
2. The repo's configured reviewers or `CODEOWNERS` on GitHub.

Nothing resolved ⇒ open the PR with no reviewers. Never invent one.

## Procedure: Resolve PR coordinates

**Inputs:** the PR token a command was given — a number, a full URL, or nothing.

A full URL names its own repo, and that repo **wins over the profile**: a PR URL
for another repo is that repo's PR even when run from this checkout.

- `https://github.com/<owner>/<repo>/pull/<id>` → owner `<owner>`, slug
  `<repo>`, id `<id>`.
- A **bare number** takes `OWNER` and `REPO_SLUG` from the profile — never a
  hardcoded owner.
- **Nothing** — `gh pr view --json number` resolves the PR for the current
  branch. Never guess a PR number.

## Procedure: PR details and CI status

**Inputs:** the coordinates above.

`gh` throughout:

```sh
gh pr view <id> --json number,title,state,isDraft,headRefName,baseRefName,headRefOid,url
gh pr checks <id> --json name,state,bucket,link,workflow
```

`state` on the PR is `OPEN` / `CLOSED` / `MERGED`. A check's `bucket` is the
normalised one to read — `pass`, `fail`, `pending`, `skipping`, `cancel` — and
`state` is the raw conclusion. For the failing logs, take the run id from the
check's `link` (its last path segment) and read only the failed steps:

```sh
gh run view <run-id> --log-failed
```

`gh pr checks <id> --watch --fail-fast` blocks until the checks settle.

Map the checks onto one vocabulary before reporting: **running**, **passed**,
**failed**. A command that branches on a raw `gh` status string anywhere except
inside this procedure has leaked it into its logic.

## Procedure: Diagnose CI failure

**Inputs:** the coordinates above.

1. Resolve the CI state through **PR details and CI status**.
2. **running** or **passed** — say so and stop; there is nothing to diagnose.
3. **failed** — pull the logs of the failed steps only:
   `gh run view <run-id> --log-failed`.
4. From each, extract the concrete cause — failing test names, type errors, lint
   rule + `file:line`, build/compile errors, or the failed command and its exit
   code. Logs can be long; summarize, never echo them whole.
5. Produce one **root cause** entry per distinct failure (e.g. "Type error in
   `accommodations.service.ts:42`", "3 failing tests in `pricing.spec.ts`"), each
   carrying the step name and the key log excerpt.

Diagnosis only: fixing, committing and pushing belong to the caller.

## Procedure: Review threads

**Inputs:** the coordinates above.

**Read.** Thread resolution state is GraphQL-only — no REST endpoint
exposes `isResolved`, and no REST endpoint resolves a thread:

```
gh api graphql -f query='
  query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){ pullRequest(number:$number){
      reviewThreads(first:100){ nodes{
        id isResolved isOutdated
        comments(first:50){ nodes{ databaseId path line body author{login} } } } } } } }
' -f owner=<OWNER> -f repo=<REPO_SLUG> -F number=<n>
```

The thread `id` (a `PRRT_…` node id) is what a thread is resolved with; the
per-comment `databaseId` is the REST id replies use. Conversation comments live
outside threads — `gh api repos/<OWNER>/<REPO_SLUG>/issues/<n>/comments --paginate`
— and have no resolution state, so only a caller's own record of handled ids
keeps them from being re-worked.

**Reply and resolve.**

- inline review comment —
  `gh api -X POST repos/<OWNER>/<REPO_SLUG>/pulls/<n>/comments/<databaseId>/replies -f body='…'`
  (this path takes **only** inline review-comment ids; a conversation-comment id
  404s here);
- conversation comment —
  `gh api -X POST repos/<OWNER>/<REPO_SLUG>/issues/<n>/comments -f body='…'`;
- resolve the thread, GraphQL-only:
  `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<thread node id>`.

Never resolve a thread that was not actually addressed.

## Worked example

**`repograph`** — origin `https://github.com/devmaxxx/repograph.git` ⇒ host
GitHub, owner `devmaxxx`, base `main` (remote default), tracker `none`,
reviewers from GitHub's own defaults or none. `/implement add a rename cache`
cuts `feat/add-a-rename-cache`, writes the plan, implements, and opens a GitHub
PR (not a draft) with `## Summary` and `## Test plan` and no `## Jira`.
