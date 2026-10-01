---
name: rn-mobile-build
description: >-
  Use for React Native / Expo mobile chores in Bonliva apps (bcp-mobile):
  cleaning iOS/Android/Xcode DerivedData/Metro/Pods/Gradle caches, a failing
  `ios:beta` / `android:beta` / fastlane run, "Xcode build system has
  crashed", "build.db is locked", "No podspec found", booting a simulator or
  emulator and logging in with a test account, upgrading a native library
  (pods, patches, notifications), and the git-flow release finish (merge to
  master and dev, tag, bump, next release branch).
---

# React Native mobile build

Find the app first: the workspace dir with `ios/` + `android/` (e.g.
`apps/bcp-mobile`). Prefer its own `package.json` scripts (`ios:beta`,
`bump-version:patch`, `scripts/clear-*.sh`) over hand-rolled commands, and
read a script before running it.

## Clean caches

Measure before deleting: `du -sh` each candidate and show the table, then
delete only what the user picked. Never delete lockfiles (`package-lock.json`,
`Podfile.lock`, `Gemfile.lock`) or `~/Library/Developer/Xcode/Archives` (its
dSYMs symbolicate shipped crashes) — some repo clean scripts do; skip those
lines. Paths and order: references/caches.md.

## Build and fastlane failures

Read the failing lane's last error (`fastlane/report.xml`, the lane log), then
match it in references/build-failures.md before trying anything — most
failures here have a known fix (locked build.db, crashed build service,
missing podspec, Ruby too old for fastlane, signing). Fix, rerun the same
script, report the result. Release lanes build in a clean worktree; never
edit `.env.production` to make one pass.

## Run on a simulator / emulator and log in

Boot (`xcrun simctl boot <udid>; open -a Simulator`, `emulator -avd <name>`),
run the app against the asked environment, log in with the test identity from
`$TEST_SSN` (dev/staging accept test personnummer without BankID). Not set →
ask the user to export it. Never write a real SSN into a file, commit,
command you print, or log. Commands: references/devices.md.

## Upgrade a native library

Checklist in references/library-upgrade.md: changelog, exact version, pods,
`patches/` keyed to the old version, native config, notifications on a real
device, release builds of both platforms.

## Release finish (git-flow)

Steps in references/release.md: merge `release/<v>` to master and dev, tag,
cut the next release branch, bump the patch version. Push and deleting the
release branch only when the request says so; never `--force`.

## Do NOT

- Clean caches to "try something" before reading the error.
- Patch a library when a newer version fixes it — bump instead.
- Run two Xcode builds at once (Xcode + CLI share DerivedData and lock it).
