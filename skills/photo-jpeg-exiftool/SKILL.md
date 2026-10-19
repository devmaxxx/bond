---
name: photo-jpeg-exiftool
description: >-
  Use when converting a photo to JPEG, changing its quality, size or colour
  profile, or reading, copying or stripping its metadata on macOS — `sips` for
  the pixels, `exiftool` for the tags, all local. Trigger on "save as JPEG",
  "JPEG quality", "compress the photo", "resize the photo", "EXIF", "metadata",
  "exiftool", "strip GPS", "copy the metadata", and on any photo-metadata
  website such as exif.tools.
---

# Photo: JPEG with sips, metadata with exiftool

Everything runs on this machine. A photo is personal data: never upload it to a
website (exif.tools and the like) to read or write its tags.

## Before anything

- `sips` ships with macOS. `exiftool` may be missing: `which exiftool`, else
  `brew install exiftool`.
- Never write over the source. Write a new file next to it, and leave the
  original as it was.

## JPEG

```
sips -s format jpeg -s formatOptions 85 in.png --out out.jpg
```

- `formatOptions` takes a percent or `low|normal|high|best`.
- Resize: `-Z <px>` fits the longest side into `<px>`.
- Colour: `-m "/System/Library/ColorSync/Profiles/Display P3.icc"` converts
  the pixels to that profile. It does not just relabel them.
- Save once, from the best source. Each JPEG save loses detail, so a lower
  quality followed by a higher one only stacks the losses.

## Metadata

| Task | Command |
| --- | --- |
| Read | `exiftool -s -G1 file.jpg` |
| Copy from the source of the same shot | `exiftool -TagsFromFile src.heic -all:all -icc_profile out.jpg` |
| Strip everything (before sharing) | `exiftool -all= out.jpg` |
| Strip GPS only | `exiftool -gps:all= out.jpg` |

- exiftool keeps `out.jpg_original` as a backup. Add `-overwrite_original` only
  when you already keep a separate copy.
- `-all=` also removes the ICC profile, so colours can shift. Put it back with
  `-TagsFromFile src -icc_profile` when that matters.
- A chat app (Telegram, WhatsApp) strips EXIF when it sends a photo. If a
  received photo has no tags, there is nothing to copy. Say so; don't make any up.

## What this skill does not do

Copy only from the file the photo was made from. Never move a different shot's
camera, date or GPS onto an image, and never write invented ones. Either one
makes the image claim a provenance it doesn't have. If asked, say no in one
line, and offer to read, strip, or copy from the real source.
