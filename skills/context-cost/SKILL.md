---
name: context-cost
description: Use before a step that will put a large result into the conversation — a screenshot or browser snapshot, reading a whole file, a command whose output is unbounded, a broad search — and when a session has been running long enough that its context is the dominant cost. Names what each of those costs in tokens, and the cheaper form that answers the same question.
---

# Context cost

## Contract

A turn re-reads the whole conversation. Every result that lands in it is paid for again on every turn after it, so the cost of a tool call is not its own output — it is that output multiplied by the turns that follow. Measured across one machine's full local history: cache reads were **97 % of raw tokens and 65 % of weighted cost**, against 17 % for everything the model generated. The bill is what the session carries, not what it thinks.

This skill does not ask for less work. It asks for the same answer in the form that does not have to be carried.

## What things cost

Measured over 30 days on one machine, 43.1M tokens of tool results:

| Source                                    | Calls  | Tokens | Shape                                |
| ----------------------------------------- | ------ | ------ | ------------------------------------ |
| Screenshots (`computer`, `browser_batch`) | 1,239  | 14.4M  | **541 results over 10k tokens each** |
| `Read`                                    | 977    | 8.4M   | 8.6k tokens per call on average      |
| `Bash`                                    | 35,705 | 14.2M  | ~400 tokens per call, volume does it |
| `take_screenshot` (chrome-devtools MCP)   | 21     | 1.5M   | **~70k tokens each**                 |

## Rules

1. **Screenshot only when pixels are the question.** Layout, spacing, a visual regression, a rendered chart — those need an image. "Did the click work", "what does the page say", "is the button there" do not: `get_page_text`, `find`, or a snapshot of the accessibility tree answer them for a fraction of the tokens. Never take a full-page screenshot to read text off it.
2. **One screenshot, not a series.** A before/after pair is two images, not a frame every step. Close the loop with text between them.
3. **Read ranges, not files.** When a search, an index or an error already names the line, read around that line. A whole-file read of something you need three functions from is paid for on every subsequent turn of the session.
4. **Bound the output of a command.** `| head`, `| tail`, `| grep`, `--oneline`, `--stat`, a count instead of a list. An unbounded `cat`, `ls -R`, full test output or a whole log is a file read wearing a shell.
5. **Give recon to a subagent.** "Where does X live", "what calls Y", "which files match Z" — the answer is a few lines; the search that found it is thousands. A subagent pays that cost in its own context and reports only the conclusion.
6. **One task per session.** A session that has finished a task and starts an unrelated one carries the first task's whole transcript through the second. `/clear` first. Measured on the same machine: **the 15 largest sessions carried 42 % of all usage**, and the largest single one ran 3,852 turns.
7. **One Bash call per question.** Chain with && or ;, run independent tools in one message. Every call re-reads the whole context; batching turns ten re-reads into one.
8. **Unlink what does not fire.** `scripts/context-audit.py` lists the skills a project invoked in 30 days; a skill with zero fires costs its description on every turn — unlink it, relink on the day it is needed.

## Red flags

| Thought                                                  | Reality                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| "Let me screenshot to see if that worked"                | Text tells you it worked. Reserve the image for what only an image shows.      |
| "I'll read the whole file to be safe"                    | The lines you skipped cost nothing; the ones you carried cost every turn.      |
| "Just this once, the full log"                           | Full logs are the most expensive thing a session can hold. Grep it.            |
| "The context is already big, one more read won't matter" | A big context is exactly where one more read costs the most.                   |
| "Clearing loses what I learned"                          | Say what you learned in the next prompt. That is a sentence, not a transcript. |
