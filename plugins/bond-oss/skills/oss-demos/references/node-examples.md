# Node / CLI examples

Proven in clikit. Template: `templates/demo/examples/run.mjs`.

## Layout

```
examples/
  run.mjs          # runs every other .mjs against the built package, exits non-zero on any failure
  json.mjs         # one file per module or use, named after it
  watchdog.mjs
```

- Each file is a script a reader runs: `node examples/json.mjs`. It prints what
  it does, uses top-level `await`, and imports `'<name>/json'` — the published
  subpath — so it doubles as an `exports` test.
- For a self-import to resolve, the package's own `name` + `exports` are enough
  (Node resolves a package's self-reference); build first.
- No network, no secrets, deterministic output; anything slow behind a flag.

## Wiring

- `package.json`: `"examples": "node examples/run.mjs"`.
- `ci.yml` test job: `pnpm build && pnpm test && pnpm examples` on every OS.
- eslint: for `examples/**` turn off `no-console` and `antfu/no-top-level-await`.
- `tsconfig` `include` does not need `examples` when they are `.mjs`; use
  `// @ts-check` at the top for editor types.

## README

Recipes link each example by absolute URL pinned to the tag. A long recipe set
lives in `EXAMPLES.md`, one heading per example with its output.
