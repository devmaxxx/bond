---
name: routing-plugins
description: Use at the start of a session or task to pick the plugin and skill profile it needs, so unused plugins and skills stop costing context; when the task changes kind mid-session (a UI change in a backend task, a Jira ticket, a review, plugin authoring); when the user asks which plugins or skills to load, to trim context, or names a profile; or when /context shows the skill or MCP listing taking a large share.
---

# Routing plugins

## Contract

One profile per session, picked from the task and the repo, never more than the task needs. Applying one is a settings change: ask once, naming the profile and what goes on and off, then apply. Nothing changes without that answer, except when the user named the profile.

## Pick

Read the signals in order and stop at the first that decides:

1. The user named a profile or a plugin → that one.
2. The repo: `applications.md` or `.claude/skills/job-*` → `job-search`; a `.claude-plugin/` or `skills/*/SKILL.md` tree → `authoring`; a `.bond/project.json` with `"tracker": "jira"` → `work`.
3. The task: review or audit of a diff or PR → `review`; module boundaries, a domain model, splitting a service → `architecture`; visual design, palettes, a redesign → `design`; UI code to build and check in a browser → `frontend`; any other code change → `dev`.
4. No code in sight (chat, docs, notes) → `minimal`.

Profiles, their plugins and skills, and why each is in or out: references/profiles.md.

## Apply

- Call the cockpit's tool `mcp__bond-cockpit__profile` (load it with ToolSearch) with `{ "name": "<profile>" }`; `list` shows the active one. It writes only this checkout's `.claude/settings.local.json` and keeps every other key.
- Without the cockpit: write the same `enabledPlugins` and `skillOverrides` keys there yourself, from references/profiles.md.
- Then tell the user `/reload-plugins` applies it; the cockpit has already put that in the prompt box.
- Already on the right profile → say nothing and change nothing.
- The task changes kind → propose the new profile once; never switch twice in a task.
- One plugin or skill missing for one step → propose turning that one on in the cockpit's `plugins` tab, not a whole profile.

## Do NOT

- Do not touch `~/.claude/settings.json`; profiles are per checkout.
- Do not turn off bond or bond-cockpit.
- Do not hide a plugin's skill through `skillOverrides`: settings cannot hide plugin skills, only the plugin.
