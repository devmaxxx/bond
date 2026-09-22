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
user-visible surface, layer by layer, adapting the stack to what the repo has.
For each layer the change touches, ask what drifted, what bypassed a boundary,
what breaks on error or retry.

Details: references/vertical-pass.md — read for the layer stack and the per-layer questions.

## 2. Horizontal — breadth: every sibling of a kind

For each **kind** of thing the change introduces or modifies, find all its peers
and check the change is consistent with them (or that the peers now need the same
fix), mapping the generic kinds onto the repo's reality.

Details: references/horizontal-pass.md — read for the kinds and the peers each one sweeps.

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
