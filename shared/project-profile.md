# Shared project profile

> **Not an invocable command.** The single place a bond command works out _what
> kind of repo it is standing in_. Every command that touches a host, a base
> branch, an issue tracker, reviewers or a chat channel resolves this profile
> first and reads the answers off it — no command hardcodes Bonliva again.

The plugin started life inside Bonliva, so its defaults were Bonliva's: a
Bitbucket workspace, a Jira project, a `dev` base branch, a fixed reviewer list.
Those are now _one profile among several_. A repo that is not Bonliva's gets the
generic profile and the commands still work.

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
  "host": "github",
  "tracker": "none",
  "baseBranch": "main",
  "reviewers": [],
  "teamsChannel": null,
  "clockifyProject": null
}
```

Never invent this file silently. Offer to write it when a command had to guess
and the guess mattered.

## Fields

### `HOST` — where pull requests live

From the `origin` URL: `bitbucket.org` → **Bitbucket** (the `bond-bitbucket`
MCP), `github.com` or a `github-*` SSH alias → **GitHub** (`gh`). A repo with
several remotes resolves `origin`, not the first remote listed — `git remote -v`
sorts alphabetically, so the fork you push to may not be the one printed first.

Neither host matched, and no `host` in the manifest ⇒ report it and stop. A PR
opened against the wrong host is not recoverable by editing it.

### `WORKSPACE` / `OWNER` and `REPO_SLUG`

The path segments of the `origin` URL. `git@bitbucket.org:bonliva/bonliva-erp.git`
→ workspace `bonliva`, slug `bonliva-erp`. `https://github.com/devmaxxx/repograph.git`
→ owner `devmaxxx`, slug `repograph`.

### `BONLIVA` — is this a Bonliva repo?

True when the workspace is `bonliva`, when a remote points at
`bitbucket.org/bonliva/…`, or when `.bonliva-dev/project.json` exists at the
root. It gates the Jira, Teams and Clockify defaults below — nothing else.

### `BASE_BRANCH` — what a PR targets, and what a branch is cut from

First match wins:

1. An explicit `--base` argument on the command.
2. `baseBranch` in `.bond/project.json`.
3. **Bonliva only** — the slug table, which encodes real per-repo history:
   slug contains `erp` → `main`, `crm` → `dev`, `async` → `master`, else `dev`.
4. The remote's own default branch:
   `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` (strip the
   `origin/` prefix). Run `git remote set-head origin --auto` first if it is
   unset.
5. `main`.

Step 3 is why this list exists: `dev` is the right fallback inside Bonliva and
the wrong one everywhere else. Applying it to a repo whose default branch is
`main` cuts the branch off a base that does not exist.

### `TRACKER` — `jira` or `none`

`tracker` in the manifest, else `jira` when `BONLIVA`, else **`none`**.

`TRACKER=none` is a first-class path, not an error. Under it:

- Commands take a free-text description where they would take a ticket key.
- No issue is fetched, created, claimed or transitioned; nothing is commented.
- `<tickets>` is empty, so `shared/pr-template.md` omits its `## Jira` section
  and the PR title carries no key prefix.
- The branch description comes from the work itself:
  `<type>/<short-hyphenated-description>` per the `naming-git-branches` skill,
  not the `<type>/<KEY>` shape bond imposes inside Bonliva.
- A plan file is named after the branch description rather than the ticket.

`TICKET_KEYS` under `TRACKER=jira` are the configured Jira project keys — see
`BOND_JIRA_PROJECTS` in `shared/pr-template.md`. A token that is not one of
those keys is free text, not a ticket.

### `REVIEWERS`

1. `reviewers` in `.bond/project.json`.
2. `$HOME/.bond/pr-reviewers.json` — **only when `BONLIVA`.** That file holds
   Bonliva colleagues; adding them to a personal repo's PR is a request for
   review from people who cannot see the repo.
3. The host's own defaults: `get_effective_default_reviewers` on Bitbucket,
   the configured reviewers or `CODEOWNERS` on GitHub.

Nothing resolved ⇒ open the PR with no reviewers. Never invent one.

### `TEAMS_CHANNEL` / `CLOCKIFY_PROJECT`

`BONLIVA` only, unless the manifest names one. `/request-review`,
`/teams-post` and `/publish-timelog` report that the profile has no channel or
project and stop, rather than posting a personal repo's work into a work
channel.

## Worked examples

**`bonliva-erp`** — origin `git@bitbucket.org:bonliva/bonliva-erp.git` ⇒ host
Bitbucket, workspace `bonliva`, `BONLIVA` true, base `main` (slug table),
tracker `jira`, reviewers from `~/.bond/pr-reviewers.json`. Exactly today's
behaviour.

**`repograph`** — origin `https://github.com/devmaxxx/repograph.git` ⇒ host
GitHub, owner `devmaxxx`, `BONLIVA` false, base `main` (remote default; the slug
table is skipped, which is what stops it landing on `dev`), tracker `none`,
reviewers from GitHub's own defaults or none, no Teams channel, no Clockify
project. `/implement add a rename cache` cuts `feat/add-a-rename-cache`, writes
the plan, implements, and opens a GitHub draft PR with `## Summary` and
`## Test plan` and no `## Jira`.
