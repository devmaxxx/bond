# Git-flow release finish

Branches: `master` (released), `dev` (integration), `release/<x.y.z>` (the
release in QA). Mobile and API share one version, so one tag per release.

## Finish `release/<v>`

```sh
git fetch origin --prune
git switch release/<v> && git pull --ff-only
git status --porcelain                         # must be empty
git switch master && git pull --ff-only
git merge --no-ff release/<v> -m "chore(release): merge release/<v>"
git tag -a v<v> -m "Release <v>"
git switch dev && git pull --ff-only
git merge --no-ff release/<v> -m "chore(release): merge release/<v> into dev"
```

Conflicts on `dev` → resolve keeping dev's newer work; never rewrite master.

Push only when the request includes it: `git push origin master dev v<v>`.
Delete `release/<v>` only when the user says so — the answer differs per
release, so ask when unsaid.

## Next release branch

```sh
git switch dev && git switch -c release/<next>
npm run bump-version:patch                     # or :minor; updates package.json, .env, gradle, Xcode
git status --short                             # stage only what the bump touched
git add <the files bump-version changed>
git commit -m "chore(release): bump version to <next>"
```

Only the patch number moves between releases unless told otherwise. Check the
bump touched every place the version lives (package.json, Android
`versionName`/`versionCode`, iOS `MARKETING_VERSION`) before committing.

## Tags

A pushed tag is immutable — a broken build gets a new patch version, never a
moved tag. Before tagging, check `git tag -l 'v<v>*'` for a clash.
