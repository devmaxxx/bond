---
description: Create a new open-source npm library — free name check, house-stack scaffold, GitHub repo, CI and release workflows, README, examples, first PR — ready for its first release
---

# /bond-oss:new-lib

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

Usage: `/bond-oss:new-lib <name> ["one-line description"] [--kind node|react|rn|binary] [--private]`

The questions this command can need: the **name** (when free-check fails, offer
2–3 checked alternatives), the **kind** (default `node`), the **description**,
missing `OWNER` / `LICENSE_HOLDER` (`shared/oss-profile.md`), and whether to
create the **public GitHub repo** now (outward — default yes unless `--private`).

## Steps

### 1. Profile and name

Resolve `${CLAUDE_PLUGIN_ROOT}/shared/oss-profile.md`. Check the name on every
registry it will use — `npm view <name>` must return E404, and for `binary`
`curl -sA bond https://crates.io/api/v1/crates/<name>` must 404 too. A taken
name stops here; a rename later costs every file.

### 2. Scaffold

In `~/Documents/projects/<name>` (abort if it exists and is not empty):

- `node` / `react`: copy `${CLAUDE_PLUGIN_ROOT}/templates/ts-lib/` (dotfiles
  included), fill `{{NAME}}`, `{{DESCRIPTION}}`, `{{OWNER}}`, `{{LICENSE_HOLDER}}`,
  `{{YEAR}}`; `react` adds React ≥ 18 as a peer dependency and the
  `example/` workspace from the `oss-demos` skill.
- `rn`: `npx create-react-native-library@latest` (bob), then align metadata,
  LICENSE, CHANGELOG and workflows with the templates.
- `binary`: follow `oss-lib-stack` references/variants.md (native binary) and
  `npm-publishing` references/workflow.md.

Then `pnpm add -D tsdown typescript vitest eslint @antfu/eslint-config publint unrun @types/node`
(latest — confirm current majors through `bond:docs-explorer`), write
`src/index.ts` with the first real export and a test that pins its behaviour
(`bond:testing-behavior`).

### 3. Examples and README

`oss-demos` for the kind (at least `examples/` + `pnpm examples` in CI). README
in the shape of `oss-lib-stack` references/readme.md (use
`crafting-effective-readmes` when installed).

### 4. Gate

`pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm examples`, then
`npm pack --dry-run` and `pnpm dlx @arethetypeswrong/cli --pack .` — all green
before any commit.

### 5. Repo and first PR

```sh
git init -b main && git add -A && git commit -m "chore: scaffold <name>"
gh repo create <OWNER>/<name> --public --description "<description>" --source . --remote origin --push
gh repo edit <OWNER>/<name> --add-topic <t1>,<t2>,… --enable-wiki=false
```

Check the active `gh` account first (`bond:authorship-conventions`). Further work
goes on `feat/<desc>` branches as PRs ready for review; confirm CI starts on the
first PR (`oss-lib-stack` references/tooling.md, "Actions never starts").

### 6. Report

Name, path, repo URL, gates, and the next step: `/bond-oss:release 0.1.0`, which
runs the one-time npm bootstrap (OTP by the user) before the first tag.
