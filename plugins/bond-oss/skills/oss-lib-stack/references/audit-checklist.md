# Audit checklist

One line per check; each failed line is a finding with `file:line` and the fix.
Compare against `templates/ts-lib/` and the user's newest lib, not memory.

## 1. Audit and improve

- [ ] Alternatives: the 3–5 closest npm packages (weekly downloads, size, last
      publish, API). Name what they do better; port it or say why not.
- [ ] Public API: every export documented, tested, and in `exports`.
- [ ] Bugs and edge cases: run `/code-review high` over the whole `src/`.
- [ ] Bundle: size of each entry; a runtime dep that could be a few lines.

## 2. License and identity (`shared/oss-profile.md`)

- [ ] `LICENSE` holder == `package.json` `author` == `LICENSE_HOLDER`.
- [ ] Year present; no handle where the name belongs; README footer agrees.
- [ ] `repository` / `homepage` / `bugs` point at `OWNER`'s repo.

## 3. Build and package

- [ ] `packageManager` on the latest pnpm 11, tsdown `dts`/`exports`/`publint`, ESM-only (or a reason).
- [ ] `files`, `sideEffects`, `./package.json` export, `bin` without `./`.
- [ ] `engines.node` == the lowest Node CI tests.
- [ ] `publishConfig` without `provenance` (trusted publishing adds it).
- [ ] `npm pack --dry-run` and attw clean.
- [ ] `unrun` present or config is `.mts`.

## 4. CI on every PR

- [ ] `ci.yml`: bare `pull_request`, push on `main` only, `concurrency`.
- [ ] Matrix ubuntu/macOS/Windows × Node 22/24, `fail-fast: false`.
- [ ] Pack job: install the tarball in a fresh project and import every export.
- [ ] `release.yml` matches the template (tag gate, pack job without
      `id-token`, idempotent publish, GitHub release from CHANGELOG).

## 5. README and docs

- [ ] Shape of references/readme.md; links absolute and tag-pinned.
- [ ] `CHANGELOG.md` with `## [Unreleased]` on top.
- [ ] Repo About + topics: `gh repo edit --description … --add-topic …`.

## 6. Ship

- [ ] Branch `<type>/<desc>`, PR ready for review (not draft outside Bonliva),
      CI green, squash-merge `type: summary (#N)`.
- [ ] A user-visible change ⇒ release it (`/bond-oss:release`) — the npm page
      shows the old README until then.
