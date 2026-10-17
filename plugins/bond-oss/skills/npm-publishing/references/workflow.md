# Release workflow shape

## TypeScript lib

Template: `templates/ts-lib/.github/workflows/release.yml`.

```
on: push tags v*  |  workflow_dispatch (branch ⇒ dry run, publishes nothing)
pack     (contents: read)           tag == package.json · install · lint · typecheck · build · test · pnpm pack → artifact
publish  (needs pack, tags only;    npm ≥ 11.21 · download tarball · npm view guard · npm publish <tgz> --tag latest|next
          id-token + contents:write) · gh release from the CHANGELOG section
```

Why each piece:

- **Two jobs** — `pnpm install` runs dependency code; the job that holds
  `id-token` must not, or a compromised devDependency can publish any version.
- **Publish the packed tarball**, not a rebuild — what CI tested is what ships.
- **Tag gate** — `v$(package.json version)` must equal the tag.
- **Prerelease** (`X.Y.Z-rc.N`) → dist-tag `next` and `--prerelease` release;
  it must never become `latest`.
- **Release notes** — the `## [X.Y.Z]` section of `CHANGELOG.md`, cut by `awk`.
- **`concurrency`** per ref, never cancelling — one publishing run per version.

## Native binary distributed via npm

Proven in zerograph (Rust). Jobs in order:

```
version  tag == Cargo.toml version
build    matrix (macos-14 arm64, ubuntu x64, windows x64); Windows smoke `--version`;
         tags: upload archives to the GitHub release (contents: write); dispatch: run artifacts
verify   (id-token, attestations: write) download assets · SHA256SUMS · attest archives + extracted binaries
npm      (needs build+verify, id-token) npm ≥ 11.21 · pack from release assets · npm view guard · publish
```

- `build` never holds `id-token` (it runs `build.rs` of every dependency).
- The pack script rewrites the README links to the tag and restores tracked
  files it mutated.
- CI (not release) packs a `0.0.0-ci` tarball on every OS and installs it into a
  consumer path with a space and non-ASCII characters.

## Dry run before the first real tag

`gh workflow run release.yml --ref <branch>` → everything but publish runs. Read
the pack artifact's file list before tagging.
