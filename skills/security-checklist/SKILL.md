---
name: security-checklist
description: Use when a diff touches authentication or authorization, user input reaching a query, a file upload, a webhook or a public endpoint, secrets or env config, cookies or CORS, or logging of user data — and when bond:routing-code-review's card reads `risk=security`. Walks a short checklist over the changed lines only and reports each hit as file:line with the fix.
---

# Security checklist

## Contract

A review for the risks this diff can introduce, not an audit of the repo. Every item is
asked of the **changed lines** and the code they call; a hit is reported with `file:line`,
what an attacker does with it, and the one-line fix. No hit ⇒ say "no findings" and which
sections applied — silence is not a verdict.

## Procedure

1. `git diff $(git merge-base <base> HEAD) --name-only` (committed and uncommitted work alike); pick the sections below whose trigger the diff hits.
2. For each picked section, read the matching block of references/checklist.md and ask
   every question of the changed code. Follow a value from where it enters (request,
   queue message, webhook, file) to where it is used (query, shell, HTML, log, redirect).
3. Report, most severe first:
   ```
   security: sections=authz,input findings=2
   - high  src/orders.controller.ts:48 — id from params used without owner check → IDOR; scope the query by req.user.id
   - low   src/auth.service.ts:91 — token logged on failure; log the user id instead
   ```

## Sections and their triggers

| Section | Trigger in the diff |
|---|---|
| secrets | env/config files, keys, `process.env`, CI variables |
| input | DTOs, controllers, resolvers, queue consumers, webhooks |
| injection | raw SQL, query builders, Mongo filters from input, `exec`/`spawn`, templates |
| authn/authz | guards, decorators, JWT/session code, any new route or MCP tool |
| web | `dangerouslySetInnerHTML`, redirects, cookies, CORS, CSP headers |
| uploads | multipart, blob storage, file paths built from input |
| exposure | logs, error responses, serializers, analytics events |
| abuse | login, signup, OTP/SMS, search, export — anything costly or guessable |

A section with no trigger is skipped, and the report says it was.

Details: references/checklist.md — the questions per section.

Adapted from the security-review skill of everything-claude-code (Affaan Mustafa, MIT).
