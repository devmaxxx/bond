# Browser / React demo

Proven in react-clear-browser-cache. Template: `templates/demo/.github/workflows/pages.yml`.

## Layout

- `example/` — a Vite app, its own `package.json` (`"private": true`, name
  `<lib>-example`), depending on the lib as `"<lib>": "workspace:*"`.
- `pnpm-workspace.yaml`: `packages: [example]`.
- `example/vite.config.ts`: `base: process.env.BASE_PATH ?? '/'` — Pages serves
  under `/<repo>/`, and a wrong base is a blank page with 404 assets.

## Root scripts

```json
"example:dev": "pnpm --filter <lib>-example dev",
"demo:build": "VITE_DEMO=1 pnpm --filter <lib>-example exec vite build --outDir dist-demo",
"demo:preview": "pnpm --filter <lib>-example preview --outDir dist-demo"
```

`VITE_DEMO=1` switches the example into a self-explaining demo (banner, links
back to the repo) while the plain example stays minimal.

## Checks

- `typecheck` covers the example: `tsc --noEmit && tsc --noEmit -p example`.
- e2e (Playwright) drives the example, not a fixture page, so the demo is tested.
- eslint ignores `example/dist*`.
- After the first deploy: open the Pages URL, check the console is clean, put
  the URL in the README header and the repo About (`gh repo edit --homepage`).
