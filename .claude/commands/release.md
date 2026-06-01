---
description: Release the bond plugin — bump the version in plugin.json + marketplace.json, commit, tag, and push
---

# /release

Cut a new release of the **bond plugin**. This bumps the version in both manifests, commits any pending changes together with the bump, creates an annotated `vX.Y.Z` tag, and pushes `main` + the tag. After the tag lands, users pick up the new version via `/plugin` update.

The two manifests **must always carry the same version**:

- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `plugins[0].version`

## Arguments

`$ARGUMENTS` — how to bump, optional. One of:

- `patch` — `X.Y.Z` → `X.Y.(Z+1)` (bug fixes only)
- `minor` — `X.Y.Z` → `X.(Y+1).0` (new commands/features) — **default when omitted**
- `major` — `X.Y.Z` → `(X+1).0.0` (breaking changes)
- An explicit `X.Y.Z` — use that exact version (must be strictly greater than the current one)

## Steps

### 1. Preconditions

Resolve the plugin repo root (`git rev-parse --show-toplevel`) — this command operates on the **bond plugin repo**, not whatever project happens to be open. Confirm `.claude-plugin/plugin.json` exists there; if not, abort ("Not in the bond plugin repo").

Then:

```sh
git rev-parse --abbrev-ref HEAD          # must be main
git fetch origin
git status --short                       # note pending changes (will be released)
```

- If not on `main`, ask the user whether to switch (`git checkout main`) or abort.
- Bring `main` up to date: `git pull --ff-only origin main`. If it can't fast-forward, stop and tell the user to reconcile first.
- Pending working-tree changes are expected (they're what you're releasing) and will be committed in step 5. If the tree is completely clean **and** there are no commits since the last tag, abort: "Nothing to release."

### 2. Compute the next version

Read the current version from `.claude-plugin/plugin.json`. Derive the next version from `$ARGUMENTS` (default `minor`). For an explicit `X.Y.Z`, verify it is strictly greater than the current version. Confirm the resulting version with the user before writing anything.

### 3. Bump both manifests

Write the new version into **both** files, preserving all other keys and formatting:

- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `plugins[0].version`

If new commands were added since the last release, also refresh the command list in `plugin.json`'s `description` and the `/commands` table in `README.md` so they stay in sync. (Don't invent entries — only reflect commands that actually exist under `commands/`.)

### 4. Generate release notes

Collect the commit subjects since the last tag:

```sh
LAST=$(git describe --tags --abbrev=0)
git log "${LAST}..HEAD" --pretty=format:'- %s'
```

Group them into a short changelog (Features / Fixes / Chore). Also fold in the pending working-tree changes from step 1 — describe what they do, not just the filenames. This becomes the annotated tag body and is printed in the summary.

### 5. Commit

Stage everything (the version bumps plus any pending work) and commit. Use a release-style subject matching the repo's history (`feat: vX.Y.Z — <one-line summary>`):

```sh
git add -A
git commit -m "feat: vX.Y.Z — <summary>" -m "<changelog body>"
```

End the commit message with the standard co-author trailer.

### 6. Tag and push

Create an **annotated** tag with the changelog as its body, then push the branch and the tag:

```sh
git tag -a vX.Y.Z -m "vX.Y.Z" -m "<changelog body>"
git push origin main
git push origin vX.Y.Z
```

Per the user's standing preference, push without asking for confirmation.

### 7. Summary

Print:

- Released version `vX.Y.Z` (from `<previous>`)
- The changelog
- Tag pushed: `vX.Y.Z`
- Reminder: users update with
  ```sh
  /plugin marketplace update devmaxxx
  /plugin update bond@devmaxxx
  ```
  then **restart Claude Code** so the new command versions and any MCP template changes load. (The cached copy under `~/.claude/plugins/cache/devmaxxx/bond/<version>/` only refreshes after this.)

## Do NOT

- Do not bump only one manifest — `plugin.json` and `marketplace.json` versions must match exactly.
- Do not release from a branch other than `main`, or with `main` behind its remote.
- Do not hand-edit `~/.claude/plugins/cache/...` to fake a release — the cache is updated by `/plugin update`, not by this command.
- Do not reuse or move an existing tag — every release gets a new, strictly-greater version.
