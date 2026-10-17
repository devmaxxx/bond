# GIFs and images

## GIF from a recording

`templates/demo/scripts/gifs/to-gif.sh <in.mp4> <out.gif> <crop w:h:x:y> [skip] [width]`
— ffmpeg at 25 fps, a palette built from the clip (`palettegen stats_mode=diff`,
`paletteuse dither=bayer`). Keeps a 10 s clip at 320 px under ~2 MB.

Sources of the recording:

- Browser demo: Playwright `video: 'on'` on one scripted e2e path, or a screen
  capture of the deployed Pages demo through `claude-in-chrome` `gif_creator`.
- Simulator / emulator: see rn-demo.md.
- Terminal: `vhs` tape file kept in the repo (`docs/demo.tape`), rendered to GIF.

The script that makes the media is committed next to it — re-recording after a
UI change is one command, not an afternoon.

## Comparison image

One image at most in the README "Why". Keep its source (HTML or SVG) beside the
PNG in `docs/`, so a number change is an edit, not a redraw. No dates on it.

## Where it lives

`docs/*.gif|png`, referenced from the README by absolute
`https://raw.githubusercontent.com/<OWNER>/<name>/vX.Y.Z/docs/…` so npmjs.com
renders it. `docs/` is outside `files`, so media never ships in the tarball.
