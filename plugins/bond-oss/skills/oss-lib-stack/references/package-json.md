# package.json

Template: `templates/ts-lib/package.json`. Field by field, with the shape that
broke a past lib.

| Field | Rule | Seen wrong |
|---|---|---|
| `name` | free on npm (`npm view <name>` → E404) **before** the first public commit; check scoped and platform names too | repograph taken on npm *and* crates.io after weeks of work → rename of ~1000 occurrences |
| `type` | `module` | — |
| `version` | `0.1.0` for a new lib; `1.0.0` only when the API is promised | — |
| `packageManager` | pinned `pnpm@x.y.z` | — |
| `description` | one sentence, plain; numbers as digits ("24 languages") | — |
| `author` | `LICENSE_HOLDER`, same string as `LICENSE` | a handle in one, the full name in the other → "fix license" |
| `license` | `MIT` | — |
| `homepage` / `repository` / `bugs` | `https://github.com/<OWNER>/<name>`; `repository.url` as `git+https://….git` | a renamed owner left in metadata |
| `keywords` | many: what people search, not what the code is named | — |
| `sideEffects` | `false` | — |
| `exports` | written by tsdown (`exports: true`); every subpath an entry; `./package.json` kept | one `types` field shared by `import` and `require` → wrong `.d.ts` for one format; nest `types` inside each condition |
| `bin` | `"bin/cli.js"`, no leading `./` | npm 11: `"bin[x]" script name ./bin/cli.js was invalid and removed` — the CLI shipped without a bin |
| `files` | `["CHANGELOG.md", "dist"]` (+ `bin`) | — |
| `engines.node` | the lowest Node CI runs the tests on | `>=20` while Vitest needs 22 → CI never proved 20; either raise it or add an import-only `node-20` job over `dist` |
| `peerDependencies` + `peerDependenciesMeta.optional` | integrations (OpenTelemetry, pino, React) | React listed as a dep → two Reacts |
| `publishConfig` | `{ "access": "public" }` | `provenance: true` / `--provenance` is redundant under trusted publishing |
| `scripts` | `build`, `dev`, `lint`, `typecheck`, `test`, `prepublishOnly: pnpm run build` | `prepublishOnly` running lint over example `dist/` → ignore it in eslint |

## Checks

```sh
npm pack --dry-run 2>&1 | tee /dev/stderr | grep -A4 "errors corrected"   # empty = good
pnpm dlx @arethetypeswrong/cli --pack . --profile esm-only               # types resolve; no profile for a dual build
pnpm dlx publint                                                           # tsdown runs it on build too
```
