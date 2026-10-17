# README

Write it with the `crafting-effective-readmes` skill when it is installed; this
file is the shape the user keeps asking for ("use awesome readme").

## Shape, top to bottom

1. Centred title, one bold line of pitch.
2. Badges: npm version, downloads, CI, types, zero-deps / size, license.
3. Quick-links row → Install · Quick start · API · FAQ.
4. **Why** — the problem, in two or three lines; one comparison image at most.
5. **Install** — npm / pnpm / yarn in one block.
6. **Quick start** — one runnable block, the 80% case.
7. **API** — one subsection per export; signature, one line, one example.
8. **Recipes** — short; long ones go to `EXAMPLES.md`.
9. **Compared with** — honest, a few rows (drop it when the user says "simplify").
10. **Limits / FAQ**, **Contributing**, **License**.

UI libs add a GIF or a live demo (GitHub Pages / Expo) and keep the scripts that
make them in the repo ("keep scripts in project").

## Rules the user set

- Short and visual beats complete; reference material goes to `docs/`.
- No dates, no tables that only restate the prose.
- One setup code block, not five steps.
- Links and images must work on npmjs.com: absolute URLs pinned to the tag
  (`https://github.com/<OWNER>/<name>/blob/vX.Y.Z/…`), never `./docs/…`.

## The npm-page catch

npmjs.com shows the README of the **last published version**. A README-only fix
is invisible on npm until the next release — ship it as a patch ("add pnpm i
and bump/release"). Say so in the PR when the README changes.
