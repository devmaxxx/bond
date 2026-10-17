---
name: oss-demos
description: Use when adding or fixing the examples, live demo, GIFs or screenshots of an open-source library — an `examples/` folder, an `example/` app in a pnpm workspace, a GitHub Pages or Expo web demo, an EAS update or APK, a README GIF — and on "prepare demo", "add examples", "record a gif", "deploy the demo", "playground". Picks the demo kind from the lib kind and keeps every example run by CI.
---

# OSS demos and examples

## Contract

An example nobody runs rots: every example runs in CI against the **built**
package, imported by its published name, so a broken `exports` fails there first.
A demo is code in the repo — the app, its deploy workflow and the scripts that
record its GIFs — never a one-off made by hand. Templates:
`${CLAUDE_PLUGIN_ROOT}/templates/demo/`.

## Pick by lib kind

| Lib kind | Examples | Live demo | Media |
|---|---|---|---|
| Node / CLI helpers | `examples/*.mjs` + `examples/run.mjs`, `pnpm examples` in CI | — | terminal cast (optional) |
| Browser / React | `example/` Vite app as a pnpm workspace package | GitHub Pages (`pages.yml`) | GIF of the demo |
| React Native | Expo `example-expo/` | Expo web export → Pages; EAS update; APK on a `demo` release | iOS + Android GIFs from scripts |
| Native binary CLI | `examples/` shell scripts | — | before/after image, source kept beside it |

Detail per kind: references/node-examples.md, references/web-demo.md,
references/rn-demo.md. GIF and image recipe: references/media.md.

## Steps

1. Read the README's Quick start and API: each example mirrors one documented
   use, in the order the README teaches it. A use with no example is the gap.
2. Build the examples/demo from the template for the kind; import the lib by its
   package name (workspace link or the built `dist`), never `../src`.
3. Wire CI: `pnpm examples` in the test job, or the demo build in `pages.yml`
   (Pages source set to "GitHub Actions": `gh api -X POST repos/<o>/<r>/pages -f build_type=workflow`).
4. Link from the README: demo URL near the top, the GIF under the pitch,
   `EXAMPLES.md` or `examples/` from Recipes — absolute, tag-pinned URLs.
5. Verify: run the examples locally, open the deployed demo in a browser, and
   check the GIF size (< 2 MB) before committing it.
