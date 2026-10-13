---
description: Write a LinkedIn post or article about a feature, a repo or a topic — facts from the source, numbers checked — with an optional cover-image prompt; /bond:linkedin-draft puts it into LinkedIn
---

# /bond:linkedin

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

Turns something real — a plugin, a feature, a commit range, a workflow — into a LinkedIn post or article. Apply the `linkedin-writing` skill throughout; it owns the voice, the formats and the browser steps.

## Usage

```
/bond:linkedin <topic> [--post | --article] [--cover] [--anon]
```

| Argument | Effect |
| --- | --- |
| `<topic>` | What to write about: a path, a plugin or command name, a PR, a commit range, or free text. |
| `--post` / `--article` | Feed post (plain text, ~1,500 characters) or long-form article (headings, ~1,500 words). |
| `--cover` | Also write a detailed cover-image prompt (article) or pick the screenshot to attach (post). |
| `--anon` | No author voice, no product or repo name, no handle or install line; "Link in comments." instead. |

## Steps

### 1. Read the source

Read-only, before the question: the README section, the command or skill file, and the commit bodies that introduced the topic (`git log --oneline -n 20 --grep=<topic>`, then `git show -s` on the relevant ones). Note every third-party fact the text will lean on — a price, a limit, a default.

### 2. Ask

One `AskUserQuestion` with what the arguments left open, recommended option first:

- **Format** — post or article.
- **Angle** — two or three hooks drawn from what the source actually does (cost, time saved, a failure it prevents).
- **Attribution** — neutral and anonymous (recommended when unsure), named product, or first person.
- **Extras** — cover-image prompt, or which screenshot goes with the post.

### 3. Check the numbers

Each third-party fact from step 1 goes through `bond:docs-explorer` (or the vendor's docs page directly). A fact that cannot be confirmed is cut, or kept and named as unchecked in the report.

### 4. Write

Follow the `linkedin-writing` formats. Print the text in the chat in a form ready to paste: a post as plain text, an article with its headings.

### 5. Cover (when asked)

One cover-image prompt per `references/formats.md` of the skill, with its technical description (aspect, resolution, style, palette, composition, lighting, exclusions) inside it — the prompt only, no variants or per-tool settings.

## Report

The text, what was checked and against which doc, and what was left unchecked. Close with the next step: `/bond:linkedin-draft` to put it into LinkedIn.
