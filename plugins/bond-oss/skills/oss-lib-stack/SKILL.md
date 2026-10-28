---
name: oss-lib-stack
description: Use when creating, auditing or changing the build, packaging, CI, README or metadata of an open-source library published to npm — a `package.json` with `exports`/`files`/`publishConfig`, a `tsdown.config.ts`, `.github/workflows/ci.yml`, a LICENSE or CHANGELOG — and on "audit and improve", "fix license", "run ci for PRs", "awesome readme", "make it publishable". Holds the house stack, the drift to fix, and the traps that broke past libs.
---

# OSS lib stack

## Contract

One stack across every lib, so a fix learned in one ports to all. The templates
in `${CLAUDE_PLUGIN_ROOT}/templates/ts-lib/` are the source of truth; a lib that
differs from them without a reason written in its repo is drift, and drift is a
finding. Identity comes from `${CLAUDE_PLUGIN_ROOT}/shared/oss-profile.md`.

## The stack (TypeScript lib)

- **pnpm 11** (`packageManager` pinned to the latest 11.x), **tsdown** (`dts`, `exports`, `publint`),
  **Vitest**, **`@antfu/eslint-config`** (`type: 'lib'`), `tsc` as `typecheck`.
- **ESM-only**, `sideEffects: false`, `./package.json` exported, `files:
  [CHANGELOG.md, dist]`, zero or few runtime deps; optional peers for integrations.
- `engines.node` = the lowest Node CI actually tests — never lower.
- Branch `main`, tag `vX.Y.Z`, workflows `ci.yml` + `release.yml`, MIT,
  Keep a Changelog.
- Variants (React Native, dual ESM/CJS, a native binary on npm): references/variants.md.

## Gates before any PR

`pnpm lint && pnpm typecheck && pnpm build && pnpm test`, then
`npm pack --dry-run` (read the file list and any "errors corrected" warning) and
`pnpm dlx @arethetypeswrong/cli --pack . --profile esm-only` (drop the profile for a dual build). A gate the lib lacks is added, not skipped.

## Audit order

The user's own order on every lib: audit and improve (check alternatives) →
fix license/author → CI on every PR, three OSes → README → push → merge. Each is
a section of references/audit-checklist.md.

## References

- references/package-json.md — every field, why, and the wrong shapes seen
- references/tooling.md — tsdown, Vitest, eslint, Node-version traps and fixes
- references/readme.md — the README shape the user asks for, and the npm-page catch
- references/variants.md — RN (bob), dual ESM/CJS, Rust/Go binary on npm
- references/audit-checklist.md — the drift list, one line per check
