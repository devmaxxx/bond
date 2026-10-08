---
name: port-from-prototype
description: >-
  Use when bringing a screen or component from bonliva-prototypes (or a
  screenshot of it) into a real Bonliva app — "make <page> match the
  prototype", "port the new <feature> design", "the prototype changed, bring it
  over", "promote this into ui-kit", or any ask for visual parity with a
  prototype route, even when "prototype" is not said but the design lives
  upstream.
---

# Port from prototype

The prototype is the visual spec; the app re-implements it on real data,
reusing `@bonliva/ui-kit` and existing tokens. Never copy prototype code
wholesale — it has mock data and skips auth, i18n and states.

## 1. Locate both sides

- Prototypes repo: `../bonliva-prototypes`, else `~/Documents/projects/bonliva-prototypes`.
  Default branch, clean ⇒ `git -C <it> pull --ff-only`; else ask.
  Missing → ask the user to clone it, or work from the screenshot alone.
- Spec: the route under `apps/*-prototype/app/`, or a kit component under
  `packages/ui/src`. A screenshot is the spec when given.
- Target: the matching route in this repo (`apps/*/app/**`) and how it
  imports the kit (subpaths, pinned version).

## 2. Diff — write the checklist before touching code

One line per difference, grouped: **components** (incl. a richer kit
component flattened to a generic `Badge`/`Button` — the most common leak),
**columns** (order, width, alignment, formatters), **style** (spacing, radius,
borders), **font** (size, weight, family), **colour**, **states** (loading,
empty, error, hover). `git -C <prototypes> log -p -- <path>` shows what the
designer changed recently. Present the checklist and plan; this list is
"done".

## 3. Classify and implement

- Reusable (would a second feature use it?) → belongs in the kit. If the
  pinned kit can't express it, read references/kit-and-parity.md.
- One-off composition → app-local, never under `components/ui/`.
- **No new colours or magic values.** Map every colour/size to an existing
  token or kit variant; if none fits, the token is missing upstream — say so.
- Verify the backend exposes the raw value the design keys off (a type slug,
  not just its label), and that its values match the kit's variant keys.
- i18n for every string (all locales), loading/empty/error states,
  `data-test` hooks — per the target repo's conventions.

## 4. Prove parity

Run both apps, same route, same viewport, screenshot side by side, walk the
checklist until every item matches or is explicitly deferred. Details in
references/kit-and-parity.md. Then typecheck, tests via `bond:test-runner`,
and `bond:vertical-horizontal-review` (do sibling pages now look off?).

## 5. When the prototype is the source of truth

If the app reveals the prototype or kit is wrong or missing a variant, fix it
upstream in bonliva-prototypes (its own branch + PR, changeset for the kit),
then bump the pin here. Never publish the kit without the user's go-ahead.

Do NOT hand-clone a kit component to "tweak" it, or declare parity from
reading code.
