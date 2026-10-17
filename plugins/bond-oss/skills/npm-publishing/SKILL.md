---
name: npm-publishing
description: Use when publishing a package to npm or fixing a failed publish — `npm publish`, `npm trust`, `npm stage`, a release workflow with `id-token: write`, a first publish of a new name, an `EOTP`, `ENEEDAUTH`, `E404` after publish, `403 OIDC permission denied`, "cannot publish over the previously published versions", a spam-detection 403, or "npm still shows the old README". Holds the trusted-publishing setup, the one-time bootstrap, and every publish trap seen so far.
---

# npm publishing

## Contract

CI publishes; a human never does, except the one bootstrap publish of a new
name. CI authenticates by **trusted publishing** (OIDC) — no `NPM_TOKEN`, no OTP,
provenance automatic for a public repo. A version number, once published, is
spent forever: every publish is idempotent (`npm view <name>@<v>` first) and
nothing publishes until build, tests and pack have passed.

## Facts (checked against docs.npmjs.com, 2026)

- npm CLI ≥ 11.5.1 for OIDC (11.21.0+ also lets `npm dist-tag` use it); Node's bundled
  npm may be older ⇒ `npm install -g npm@^11.5.1` in the publish job.
- `permissions: id-token: write` on the publish job only. `--provenance` and
  `publishConfig.provenance` are redundant.
- A trust config needs the package to **exist**, and its first OIDC publish must
  land within 2 days of configuring it.
- Classic tokens are gone; granular write tokens expire in ≤ 90 days. After
  trust is set: package Settings → "Require 2FA and disallow tokens".

## Flows

- **First publish of a new name** (once): references/bootstrap.md.
- **Workflow shape** (TS lib and native-binary variant): references/workflow.md;
  the TS template is `${CLAUDE_PLUGIN_ROOT}/templates/ts-lib/.github/workflows/release.yml`.
- **A publish failed**: match the error in references/traps.md before retrying —
  a blind re-run can burn the version.

## After every publish

Done means someone else can install it, not that the job is green:

```sh
npm view <name>@<v> version --prefer-online   # poll ≤10 min: new versions list late
cd "$(mktemp -d)" && npm init -y >/dev/null && npm i <name>@<v> && node -e "import('<name>')"
```

A CLI: `npx <name>@<v> --version` in a clean dir. Then check the npmjs.com page
shows the new README.
