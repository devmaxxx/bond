# Kit promotion and parity check

## Is it already in the kit?

pnpm symlinks make `ls node_modules/@bonliva/ui-kit/dist` a false negative.
Ask the resolver from the consuming app instead:

```sh
node -p "require.resolve('@bonliva/ui-kit/<subpath>')"
```

Resolves → it is published at the pinned version; import it. Throws → absent.
Also scan `bonliva-prototypes/packages/ui/src` (`components/`, `composite/`)
and `packages/ui/style-guide-sections/` — the graded reference for each
component's intended API and variants.

## Promote a component upstream

Flow: edit source → changeset → version → publish → bump pin → install.

1. In bonliva-prototypes, branch from the default branch.
2. Add/modify under `packages/ui/src`; JSDoc the public API; register the
   subpath in `packages/ui/package.json` `exports` (and any build entry).
3. Add it to the style guide sections if the repo keeps one per component.
4. `pnpm --filter @bonliva/ui-kit build`; `pnpm changeset` — new component or
   prop = minor, visual fix = patch, breaking = major.
5. Open the PR (`/bond:open-pr`). Publishing is CI-gated (Changesets
   "Version Packages" PR) — **confirm with the user before any publish**.
6. Back here: bump `@bonliva/ui-kit` in the app's `package.json`, install,
   re-run the resolver check, swap the fallback for the real import.

### When the publish can't land this session

Keep the page shippable: compose from installed primitives (never a permanent
local clone), mark the spot `// TODO(ui-kit): promote <X>`, and hand the user
a ready-to-paste prompt for a bonliva-prototypes session describing the gap,
the proposed API, the files, the changeset level and the follow-up pin bump.

## Parity check

| App | How to find the command |
| --- | --- |
| Prototype | `apps/*-prototype/package.json` `dev` script (ERP prototype: port 5001) |
| Target | the repo's dev script; seed or mock data if the backend is down — parity is visual |

1. Same viewport in both (1440x900; plus a mobile width if responsive).
2. Same logical route; screenshot each (claude-in-chrome or chrome-devtools).
3. Walk the checklist item by item; re-shoot after each pass.
4. Check the interaction states the prototype shows (hover, open, selected,
   disabled, empty, error). Keep before/after shots for the PR.

## Common mismatch causes

- **Stale kit pin** — the prototype uses unpublished `packages/ui` changes.
  Fix upstream, not with CSS in the app.
- **Token drift** — an off colour/spacing is usually a wrong token name, not a
  wrong hex. Use the kit token.
- **Font stack** — differing text metrics are usually font loading in one app.
- **Layout chrome** — app route groups add sidebars/headers the prototype
  lacks; compare the content region.
