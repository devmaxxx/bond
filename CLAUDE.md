# How to work in this repo

The rules below are adapted from Andrej Karpathy's CLAUDE.md and target the most common LLM coding failure modes.

1. Start every reply with the user's name. This file is shared, so the name is
   not written here: each person sets their own in a personal `~/.claude/CLAUDE.md`
   (or an unversioned `.claude/CLAUDE.local.md`). If no name is set anywhere, use
   `git config user.name`.
2. Answer as briefly as possible: key information only, no filler, no long code
   fragments — point to the file and line instead.
3. When working with any third-party library, look up official docs first to confirm current APIs. Use the DocsExplorer subagent for documentation lookup.
