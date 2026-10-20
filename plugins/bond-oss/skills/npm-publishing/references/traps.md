# Publish traps

Error (quoted as seen) → cause → fix. Match here before any retry.

| Error | Cause | Fix |
|---|---|---|
| `npm error code EOTP` | manual publish needs an OTP; the agent has none | the user runs the command with `!` and the real code; never guess `--otp=123456` |
| `ENEEDAUTH` / `npm login` hangs | browser login exceeds the command timeout | `npm login` in the user's own terminal, then retry |
| `403 … OIDC permission denied for this action` | trust entry allows stage only (`npm trust list` → `permissions: stage`) | `npm trust revoke <name> --id=<id>`; `npm trust github … --allow-publish`; `gh run rerun <id> --failed` |
| `404 Not Found - PUT …` from the OIDC job | no trust config, wrong workflow filename, or package not created yet | bootstrap.md; workflow file must be exactly the trusted one (`release.yml`) |
| `You cannot publish over the previously published versions: X` | that version already exists — a manual publish raced the tag, or a re-run | idempotent guard (`npm view` before publish); never bump to "fix" a re-run |
| `E404 … '<name>@X' is not in this registry` right after `+ <name>@X` | registry lists new versions late (minutes); new names may show `0.0.0-stage` | poll `npm view <name>@X version --prefer-online` ≤ 10 min before calling it failed |
| `403 … Package name triggered spam detection` | npm refuses the name itself (seen on `<name>-win32-x64`) | rename, or collapse per-platform packages into one |
| `npm warn publish "bin[x]" script name ./bin/x.js was invalid and removed` | npm 11 strips `bin` paths it rejects | `"bin/x.js"` without `./`; check `npm publish --dry-run`; ship a patch |
| job green, `npm view` 404 | published to another registry (GitHub Packages via `.npmrc` / `publishConfig.registry`) | `registry-url: https://registry.npmjs.org` in setup-node; drop the override |
| two runs for one tag | tag moved/re-pushed, or dispatch + tag | `concurrency` on the workflow; cancel the extra; one publishing run per version |
| unattested version published | publish job did not `needs` the attest/verify job | `needs: [build, verify]`; the version cannot be republished |
| npmjs.com shows the old README | the page renders the last published version | patch release; pin README links to the tag |
| `gh release create --draft --verify-tag` exit 1, `untagged-…` draft left | tag not pushed yet | push the tag first; delete the stray draft |
| auto-mode denies `gh pr merge` / dispatch / `gh release edit` | harness classifier, not GitHub | ask once; the user's explicit "merge" / "release" unblocks |

## Before retrying anything

1. `npm view <name> versions --json --prefer-online` — is the version already out?
2. `npm trust list <name>` — publish permission present?
3. `gh run view <id> --log-failed | tail -40` — the real error line.
