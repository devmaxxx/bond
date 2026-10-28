# Notice

This skill combines two third-party review guides. `SKILL.md` is bond's own;
each subdirectory keeps its upstream license.

- `stacks/` — awesome-skills' `code-review-skill`, MIT ([LICENSE](stacks/LICENSE)).
  Previously vendored as `skills/code-review-skill`. Its `SKILL.md` is renamed
  `GUIDE.md` so it is not loaded as a skill of its own; nothing else changed.
- `security/` — the `security-review` skill, whose reference material is
  derived from the [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/),
  licensed under [CC BY-SA 4.0](security/LICENSE). This directory stays under
  that license; the rest of bond is MIT. Its `SKILL.md` is renamed `GUIDE.md`
  for the same reason; nothing else changed. The copy records no upstream
  repository or commit.

Refresh either directory from its source rather than editing it, and reapply
the rename.
