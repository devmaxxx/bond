# Notice

Adapted from Trail of Bits' `plugins/differential-review/skills/differential-review` (plugin version 1.1.4), from
<https://github.com/trailofbits/skills> at commit `bf23bfb`, licensed under
[CC BY-SA 4.0](LICENSE). This directory stays under that license; the rest of
bond is MIT.

Copied unchanged except for one field: the frontmatter's `allowed-tools` drops `Write` and narrows `Bash` to read-only `git` commands. bond's security-review loads this skill on PR content it does not trust, and a loaded skill's tools run without a permission prompt. Refresh the rest from upstream rather than editing it, and reapply that change. The plugin's `adversarial-modeler` agent and `/diff-review` command are not included.
