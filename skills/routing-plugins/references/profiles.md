# Profiles

The source of truth is `plugins/bond-cockpit/hooks/profiles.ts`; profiles edited in the cockpit's `plugins` tab (✎) live in its store and win over this table.

bond, bond-cockpit and the built-ins are on in every profile. Every plugin and skill below that a profile does not list is turned off by it.

| Profile | Plugins on | User skills on | For |
|---|---|---|---|
| minimal | — | credential-handling | chat, docs, notes |
| job-search | — | credential-handling, captcha-ninja, writing-scope-briefs | applications and boards in Chrome |
| dev | superpowers, zerograph | credential-handling, clean-architecture, software-design-philosophy, property-based-testing | backend and full-stack code |
| frontend | dev + frontend-design, chrome-devtools-mcp, ui-ux-pro-max (the standing rule for UI changes) | dev + emil-design-eng | UI code checked in a browser |
| design | frontend + taste-skill | credential-handling, emil-design-eng | visual design, styles, palettes |
| architecture | superpowers, zerograph | dev + domain-driven-design, writing-scope-briefs | boundaries, modules, domain models |
| review | zerograph, claude-security | credential-handling, security-review, property-based-testing | code and security review |
| work | dev + atlassian, bonliva-dev | dev | Jira tickets in work repos |
| authoring | superpowers, skill-creator, claude-md-management | credential-handling, crafting-effective-readmes, writing-scope-briefs, arch-tsdown | plugins, skills, CLAUDE.md, READMEs |

## Off in every profile

- **code-review, feature-dev, stackwise**: bond's `/bond:review-pr`, reviewers and `/bond:implement` cover them.
- **code-review-skill, differential-review, sharp-edges** (user skills): copies of bond's own skills.
- **mongodb, context-mode, caveman, andrej-karpathy-skills, bond-hud**: unused here, or replaced (caveman by the standing rule, bond-hud by the cockpit).
- **orca-cli, orca-computer-use, orchestration**: only for Orca sessions; turn them on in the `plugins` tab when one starts.

`reset` removes every managed key from the local file, so the user settings decide again.
