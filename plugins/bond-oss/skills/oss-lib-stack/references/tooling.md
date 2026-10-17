# Tooling traps

Each line: symptom → cause → fix. All seen in the user's libs.

## tsdown

- `Failed to import module "unrun"` on `pnpm build` (Node 22.13) → tsdown loads a
  `.ts` config through `unrun`, absent → `pnpm add -D unrun`, or rename the config
  to `tsdown.config.mts`, or `tsdown --config-loader native`. CI on a newer Node
  passes while the laptop fails, so check locally on the `.nvmrc` Node.
- Dual build pulls a heavy dep into every entry → rolldown shares CJS interop
  helpers through `index.cjs`, so `core.cjs` requires it → one CJS build per
  entry, `clean: false`, and clean `dist/` once in the `build` script.
- `exports: true` rewrites `package.json` on build — commit that diff, never
  hand-edit `exports` afterwards.

## Vitest / Vite / jsdom

- `ESM syntax in a file loaded as CommonJS` → Vitest 5 / Vite 8 / jsdom 30 need
  Node 22+ → `.nvmrc` 24, CI matrix `[22, 24]`, `engines` ≥ 22.
- Several React versions as devDeps → `ERESOLVE` → a CI matrix step
  `pnpm add -D -w react@X react-dom@X` per version instead.

## eslint (`@antfu/eslint-config`)

- `type: 'lib'`. Examples get `no-console` and `antfu/no-top-level-await` off.
- Ignore example `dist/` folders, or `prepublishOnly` lint fails on build output.

## Tests

- Secret-shaped fixtures (`sk-…`, `AKIA…`) built at runtime in `test/fake.ts`,
  so the repo holds nothing a scanner or push protection flags.
- A CLI or Node lib tests on ubuntu, macOS and Windows (`fail-fast: false`);
  Windows needs `core.autocrlf false` when tests compare bytes.

## CI

- `pull_request: branches: [main]` skips a PR into any other branch → bare
  `pull_request:`. Kick a stuck PR with `gh pr close N && gh pr reopen N`.
- Push on every branch *and* `pull_request` → CI twice → push only on `main`.
- A brand-new repo where Actions never starts (seen once, unresolved): check
  Settings → Actions → "Allow all actions" and that the default branch holds the
  workflow, before the first release depends on it.
