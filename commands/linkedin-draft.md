---
description: Put an approved LinkedIn post or article into LinkedIn's composer or article editor through Chrome, with its image — a saved draft, never published
---

# /bond:linkedin-draft

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

The second half of `/bond:linkedin`: the text is already written and approved; this command only puts it into LinkedIn. Apply the `linkedin-writing` skill — its `references/browser-draft.md` owns the editor mechanics.

## Usage

```
/bond:linkedin-draft [--post | --article] [<text file>] [--image <path>]
```

| Argument | Effect |
| --- | --- |
| `--post` / `--article` | Feed composer or article editor. Default: an article when the text has headings, else a post. |
| `<text file>` | The text to fill. Default: the last post or article written in this conversation. |
| `--image <path>` | The image to attach to a post, or the cover of an article. |

## Steps

### 1. Ask

One `AskUserQuestion` with what the arguments left open: which text when the conversation holds more than one, post or article, and which image when one is mentioned but no path is given.

### 2. Open the editor

`claude-in-chrome`: `tabs_context_mcp`, then a new tab — never a tab left over from an earlier draft. Post: `https://www.linkedin.com/feed/?shareActive=true`. Article: `https://www.linkedin.com/article/new/`.

### 3. Fill

Per `references/browser-draft.md`: the title (article), the body by a paste event, the paragraph gaps restored (post), the image through the file input.

### 4. Confirm

One screenshot of the top and one of the end of the draft. Check the text length against the source, the headings and lists (article), and the image.

## Stop line

Never click Post, Publish, Schedule or Next-to-publish. Leave the tab open.

## Report

Draft URL (article) or "open in the composer" (post), what is attached, and what remains for the user: the cover if none was given, the link in the first comment, the Publish click.
