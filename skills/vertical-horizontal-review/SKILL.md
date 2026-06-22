---
name: vertical-horizontal-review
description: >-
  Use when reviewing a code change — a pull request, a branch diff, or staged
  work before commit. Enforces the mandatory two-pass review: VERTICAL (trace one
  feature through every layer it touches, persistence → user-visible surface) and
  HORIZONTAL (sweep every sibling of the kinds the change introduces or modifies,
  checking for drift). Project-agnostic — derive the layer stack and the sibling
  kinds from the repo in front of you. Trigger on "review this change", "review
  the diff", "review my branch", "review this PR".
---

# Code Review — Vertical + Horizontal

Every review is **two passes**. Do not skip either. Label the axis explicitly in
the output so a human can scan it.

Start by reading the diff (`git diff <base>...` or the PR). First **discover the
repo's shape** — don't assume a stack:

- Skim the tree and config (`package.json`/workspaces, `go.mod`, `pyproject`,
  framework configs) to learn the **layers** this codebase has (persistence,
  domain/business logic, API/transport, shared contracts/types, async workers,
  UI, auth/security, infra).
- Note the **conventions** the repo enforces — a single source for shared
  types, a value object for money, a repository/data-access boundary, an import
  alias, an i18n catalog, a job/idempotency pattern. These become the checks.

Then list which layers the diff touches and run both passes against the layers
and conventions you actually found.

## 1. Vertical — depth: one feature, all layers

Trace the change from its deepest layer (persistence / data) up to the
user-visible surface, layer by layer. A typical stack, adapt to what the repo
has:

1. **Persistence** — schema/entities, migrations, indexes, DB constraints, access
   policies (RLS, scoping).
2. **Data-access boundary** — is every scoped read going through the repo's
   sanctioned path (repository/guard/tenant scope), not a raw escape hatch?
3. **Domain / pure logic** — calculations and rules in a domain service or shared
   module, not inlined in a controller or component.
4. **API / transport** — handlers, request/response validation, guards,
   throttling, error mapping.
5. **Shared contracts** — DTOs/enums/types consumed by multiple sides; check for
   a local copy that has drifted from the single source.
6. **Workers / async** — queued jobs, schedules, external syncs: idempotent and
   safe to retry?
7. **UI** — data fetching, forms, cache invalidation, URL/state; loading/empty/
   error states.
8. **Security / privacy** — authn/authz at the right boundary, secrets, PII,
   public-endpoint gating.

For each layer the change touches, ask:

- Does the type/contract match the layer above and below? Did a local copy drift
  from the shared source of truth?
- Is the data-access / isolation boundary intact — scoped correctly, not bypassed
  by a raw query or a dropped transaction context?
- Do domain values use the repo's sanctioned representation (e.g. integer minor
  units for money, the project's date/calendar utility) end to end?
- Are validation and authorization at the **right** boundary — not duplicated,
  not missing?
- What happens on error, null, empty, or network loss? Is there a visible UX
  state for each?
- Are async effects idempotent and safe to retry?

## 2. Horizontal — breadth: every sibling of a kind

For each **kind** of thing the change introduces or modifies, find all its peers
and check the change is consistent with them (or that the peers now need the same
fix). Map the generic kinds below onto the repo's reality:

- New shared DTO/enum/type field → every consumer across all sides that read it.
- New schema column → migration, access policy, seed/fixtures, any DTO exposing
  it, any invariant check.
- New endpoint → matching client/proxy/route, throttling category, auth-guard
  parity with sibling endpoints.
- New domain calculation → does it use the same value object / helper as every
  other one of its kind?
- New scoped query → does it go through the same data-access boundary as its
  peers?
- New user-facing string → present in every locale/translation catalog?
- New async job → follows the established scheduling / idempotency / dedupe
  pattern?
- New import → uses the repo's import-path convention (alias vs relative) like
  its siblings?

The horizontal pass is where silent drift hides: one of N siblings updated, the
rest left stale. Name the siblings you checked.

## Output format

```
## Review: <branch / PR>

### Vertical (layers touched: <list>)
- [layer] finding — severity (blocker | should-fix | nit) — file:line — fix

### Horizontal (kinds swept: <list>)
- [kind] finding — severity — file:line — fix

### Verdict
<ship | ship after blockers | needs rework> + one-line rationale
```

Report only real findings. No praise, no restating what the diff obviously does.
If a pass surfaces nothing, say so explicitly ("Horizontal: no sibling drift").
