# Variants

## React Native component

- `react-native-builder-bob` (output `lib/`), Jest, an Expo `example/` app.
- Demo: EAS update + an APK attached to a `demo` GitHub release; GIFs made by
  scripts in `scripts/gifs/`, kept in the repo.
- The example app keeps its own version (EAS `runtimeVersion`); do not bump it
  with the lib.
- Minimum React 18, as a peer.

## Dual ESM + CJS (only when a consumer needs `require`)

- tsdown `format: ['esm', 'cjs']`; one CJS build per entry (see tooling.md).
- `exports` with nested `types` per condition; `'use client'` banner for React
  client components.
- Default for a new lib is ESM-only — dual costs a build and a class of bugs.

## Native binary on npm (Rust, Go)

Pattern proven in zerograph. One unscoped package carrying every platform binary
plus a small JS launcher (`bin/<name>.js` maps `process.platform-arch` to
`bin/<platform>/<name>`), no `postinstall`, no `optionalDependencies`:

- one package avoids npm's name-spam 403 on `<name>-win32-x64`-style names and
  keeps lockfiles portable; split per platform only when size forces it;
- unsupported platform → the launcher prints a fallback (`cargo install …`);
- Windows: run from a per-version copy so `npm i -g` over a running process does
  not hit `EBUSY`; smoke `--version` on a clean runner to catch a missing DLL;
- pack from the GitHub release assets, never rebuild in the publish job, so npm
  carries the bytes that were checksummed and attested;
- `SHA256SUMS` + `actions/attest-build-provenance` over the archives *and* the
  extracted binaries; only the attest and npm jobs hold `id-token` (never the build), and npm
  `needs` it;
- the pack script copies the root README with links pinned to the tag, and
  restores any tracked file it mutated (`git checkout -- npm/`).

The release workflow shape for this variant is in
`skills/npm-publishing/references/workflow.md`.
