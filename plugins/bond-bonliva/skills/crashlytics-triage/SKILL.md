---
name: crashlytics-triage
description: >-
  Use when triaging mobile crashes from Firebase Crashlytics — given a
  console.firebase.google.com/…/crashlytics/… issue URL, or "check crashlytics
  for ios|android <version>, last N days". Groups events by issue, finds the
  frame in our code, separates real crashes from noise, files Jira bugs (BON,
  label crashlytics, fixVersion, assigned to me) and can prepare a fix PR
  against the release branch. Trigger on "crashlytics", "check crashes",
  "fix this crash" with a Firebase link.
---

# Crashlytics triage

Tools: `mcp__firebase__crashlytics_get_issue`, `…_list_events`,
`…_batch_get_events`, `…_get_report`. Not loaded → ToolSearch `crashlytics`;
not installed or 401 → ask the user to run `! npx -y firebase-tools@latest login`.

## 1. Scope

- **URL** — read project, platform (`android:`/`ios:` + bundle id) and issue
  id out of the path; `versions=` and `time=` from the query.
- **"<platform> <version>, last N days"** — app id from the repo's
  `google-services.json` / `GoogleService-Info.plist`. "Both" or "check
  android as well" → run the whole flow per platform.

## 2. Collect, grouped by issue

`get_report` for the top issues in scope, then `list_events` (or
`batch_get_events`) for 2–3 sample events each. Per issue keep: title,
event and user counts, versions, OS/device spread, first/last seen.

## 3. Find our frame and classify

Walk each stack to the topmost frame in **our** code (not `node_modules`,
React Native core, or system libs) and open that file:line in the repo at
the affected version's tag or release branch. Classify per
references/classify.md: **real** (ours, fixable), **upstream** (a library
bug — check whether a newer version fixes it), or **noise**.

## 4. Show the list, then file

Print a table — issue, platform, events/users, our frame, verdict, one-line
cause — and wait for the user's go-ahead before creating anything. Then
per real/upstream issue, via the Atlassian MCP (or `/bond:jira`):

- project **BON**, type **Bug**, label **crashlytics**, assignee = me;
- fixVersion = the next release after the affected one (ask if that version
  does not exist in Jira — never invent one);
- summary `<Platform>: <exception> in <our frame>`; description with counts,
  versions, the frame, the cause, and the Crashlytics issue URL as a link.

Skip anything already filed — search BON for the URL or title first.

## 5. Optional fix PR

When asked: base = the current `release/*` branch (newest, unless named);
a typed branch per `bond:authorship-conventions`; one commit per Jira key;
the keys in the PR body (`bond:pr-template`). Can't reproduce on a simulator
→ say so and fix from the stack, defensively, rather than guessing a repro.
A library fix → prefer the upstream version bump over a patch.

## Do NOT

- File noise, or file before the user has seen the list.
- Report a frame you have not opened in the code at that version.
- Let local/dev builds report — if they show up, gate collection to
  production builds.
