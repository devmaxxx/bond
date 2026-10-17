# OSS profile

Every bond-oss command resolves these four values first, in this order, and
names the source of each in its report.

| Value | Used for |
|---|---|
| `OWNER` | GitHub owner of the repo, the `gh` account that pushes, tags and creates it |
| `LICENSE_HOLDER` | `LICENSE` copyright line and `package.json` `author` |
| `NPM_USER` | the npm account that owns the package (`npm whoami`), which may differ from `OWNER` |
| `REGISTRY` | `npm` by default; `crates` or `pypi` only when the repo ships there |

## Resolution

1. `~/.config/bond/oss.json` — `{ "owner", "licenseHolder", "npmUser" }`. It is
   per machine and never committed: the names are personal, the plugin is shared.
2. The repo itself — the owner in `git remote get-url origin`, the holder in
   `LICENSE`, the `author` in `package.json`. A disagreement between `LICENSE`,
   `author` and the file in step 1 is a finding the command fixes ("fix license").
3. Missing still ⇒ one question in the command's ask-first step, and offer to
   write the answer to `~/.config/bond/oss.json`.

`git config user.name` is never the holder: it is often a handle, and a handle
in a copyright line is what "fix license" keeps undoing.

## The two accounts

`OWNER` is a GitHub account and `NPM_USER` an npm account; they are separate
identities and may carry different names. Before any push, tag, `gh repo create`
or `gh release`, apply `bond:authorship-conventions` — `gh auth status --active`
must name `OWNER`, else `gh auth switch -u <OWNER>`. Before any manual
`npm publish`, `npm whoami` must name `NPM_USER`.

## What only the human does

The agent cannot type an npm OTP, approve a staged publish, or finish a browser
login (`npm login` blocks past the command timeout). Each of those is a line the
command prints for the user to run with the `!` prefix, then it waits for the
result in the conversation — never a placeholder `--otp=123456`.
