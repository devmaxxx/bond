---
description: Add or refresh a library's examples, live demo and README GIFs — runnable examples checked in CI, a GitHub Pages / Expo demo, media made by scripts in the repo
---

# /bond-oss:demo

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

Usage: `/bond-oss:demo [examples|pages|expo|gif|all] [path]`

The questions this command can need: **which parts** (default from the lib kind
in the `oss-demos` table), whether to **enable GitHub Pages** and deploy
(outward), and whether to push and open the PR.

## Steps

### 1. Kind and gaps

Load the `oss-demos` skill. Detect the kind (React peer → web, `react-native`
peer → RN, a `bin` → CLI, else Node). List each README Quick start / API use
with no runnable example — that list is the scope.

### 2. Build

From `${CLAUDE_PLUGIN_ROOT}/templates/demo/` and the reference for the kind:
`examples/` + `run.mjs`; or `example/` workspace + `pages.yml`; or
`example-expo/` + web export + EAS; GIF scripts under `scripts/gifs/`. Examples
import the package by name, against the build.

### 3. Run and record

Run every example (`pnpm build && pnpm examples`). For a web demo, `demo:build`
and preview it, then open it in the browser (`claude-in-chrome`) and check the
console. Record GIFs only through the committed scripts; keep each < 2 MB.

### 4. Wire

CI runs the examples; `pages.yml` deploys on `main`. First deploy: Pages source
"GitHub Actions" (`gh api -X POST repos/<OWNER>/<name>/pages -f build_type=workflow`),
then `gh repo edit --homepage <pages-url>`. README: demo link and GIF at the
top, examples linked from Recipes, URLs absolute and tag-pinned.

### 5. Ship

Branch `docs/demo-<desc>` (or `feat/` when code changes), `/bond:open-pr`, CI
through `bond:pr-watch`. Report the demo URL, examples count, GIF sizes, and
that the npm page shows the new README only after `/bond-oss:release patch`.
