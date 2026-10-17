# CHANGELOG and release notes

## CHANGELOG.md (every lib)

Keep a Changelog 1.1 + SemVer. Template: `templates/ts-lib/CHANGELOG.md`.

```md
## [Unreleased]

## [1.2.0] — 2026-10-17

### Added
- **`parse(html, opts)`** accepts `allowTags` … (#41)

### Fixed
### Changed
### Removed

[1.2.0]: https://github.com/<OWNER>/<name>/compare/v1.1.0...v1.2.0
```

- Each PR adds its line under `## [Unreleased]`; the release PR only renames it.
- A bullet leads with the bold public name it changes, says the user-visible
  effect, ends with the PR/issue number. No internal refactors.
- A breaking change gets a `### Breaking` section **first**, with the migration.
- The release workflow cuts the `## [X.Y.Z]` section as the GitHub release body —
  the heading must be exactly `## [X.Y.Z]` (brackets optional, no `v`).

## Larger tools: `docs/releases/X.Y.Z.md`

When notes outgrow a CHANGELOG entry (zerograph), one file per version, applied
with `gh release edit vX.Y.Z --title "<name> X.Y.Z" --notes-file docs/releases/X.Y.Z.md`:

1. One-line headline.
2. `## Upgrading` first when anything breaks (`> [!IMPORTANT]` for traps).
3. `## Install or upgrade` — `npm i -g <name>@X.Y.Z`.
4. `## New` / `## Fixes` / `## Docs` — bold lead term, issue numbers.
5. `## Verify a download` (binaries) — `shasum -a 256 -c --ignore-missing SHA256SUMS`,
   `gh attestation verify <file> -R <OWNER>/<name>`; asset table.
6. `**Full changelog:** https://github.com/<OWNER>/<name>/compare/vPREV...vX.Y.Z`.

Links pinned to the tag. No AI attribution anywhere (`bond:authorship-conventions`).
