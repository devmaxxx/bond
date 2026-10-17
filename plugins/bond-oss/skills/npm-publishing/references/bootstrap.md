# Bootstrap: first publish of a new name

Trusted publishing can only be configured on a package that exists, so a new
name gets exactly one human publish, then CI owns it. Do this **before** the
first `v*` tag, or the tag's run fails with 404/403.

## 0. Name

`npm view <name>` → E404 means free. Check every name the lib will ever publish
(scoped, per-platform). A name can also be refused at publish time by npm's spam
filter (`403 … Package name triggered spam detection`) — no OTP fixes that; pick
another name or ship fewer packages.

## 1. Placeholder (the human runs it)

Publish an **empty** `0.0.0` from a temp dir — never from the repo, where
`npm publish` would spend the real version on an unbuilt package:

```sh
d=$(mktemp -d) && cd "$d" && npm init -y >/dev/null \
  && npm pkg set name=<name> version=0.0.0 description="Placeholder; first release follows." \
  && npm publish --access public --otp=<code>
```

The agent prints this; the user runs it with `!` and their real OTP (`npm whoami`
must name `NPM_USER` first; if not logged in, `npm login` in their own terminal).
For a CLI with a script, keep it in the repo (`scripts/npm-placeholder.sh <otp>`)
so it skips names already published.

Alternative without an OTP: `npm stage publish` on a missing name creates a public
`0.0.0-stage` placeholder; a maintainer still approves with 2FA.

## 2. Wait for it to list

`npm view <name> versions --prefer-online` — poll every 15 s; a new name can
take minutes and may show only `0.0.0-stage` meanwhile.

## 3. Trust the release workflow (the human runs it)

The first `npm trust` request asks for 2FA, so the agent prints these for the
user to run with `!`, then reads `npm trust list` back:

```sh
npx npm@latest trust github <name> --repo <OWNER>/<name> --file release.yml --allow-publish -y
npx npm@latest trust list <name>
```

or npmjs.com → package → Settings → Trusted Publisher → GitHub Actions (owner,
repo, workflow `release.yml`, environment empty unless the job uses one).

`--allow-publish` is required for a direct publish. A trust entry with only
`--allow-stage-publish` (shown as `permissions: stage`) makes the job fail with
`403 … OIDC permission denied for this action`.

## 4. First real release within 2 days

Tag `vX.Y.Z` (see `oss-release-flow`). Then lock the door: Settings → Publishing
access → "Require two-factor authentication and disallow tokens".
