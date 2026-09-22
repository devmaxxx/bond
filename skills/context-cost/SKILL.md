---
name: context-cost
description: Use before a step that will put a large result into the conversation — a screenshot or browser snapshot, reading a whole file, a command whose output is unbounded, a broad search — and when a session has been running long enough that its context is the dominant cost. Names what each of those costs in tokens, and the cheaper form that answers the same question.
---

# Context cost

## Contract

A turn re-reads the whole conversation. Every result that lands in it is paid for again on every turn after it, so the cost of a tool call is not its own output — it is that output multiplied by the turns that follow. The bill is what the session carries, not what it thinks.

This skill does not ask for less work. It asks for the same answer in the form that does not have to be carried.

## What things cost

Details: references/what-things-cost.md — read when weighing one shape of call against another.

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

Details: references/red-flags.md — read when a rule above is about to be argued around.
