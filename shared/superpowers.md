# Superpowers in the implement flow

> **Not an invocable command.** Shared include read by
> `shared/implement-flow.md` and `shared/track-build.md`. It names which
> superpowers skill each phase of `/bond:implement` runs through, and which of
> that skill's own defaults the flow overrides.

The superpowers plugin (`superpowers@claude-plugins-official`) ships the
discipline for each phase: brainstorm, plan, test first, build through
subagents, debug, verify. Bond's flow owns the order of the phases, the files
they write, the progress file, the questions and the shipping. When a phase
below names a skill, invoke it with the `Skill` tool at the start of that
phase and follow it, except where the **Overrides** say otherwise.

**Plugin not installed** (no `superpowers:` skills in the session's skill
list): run each phase in-thread from the procedure's own text in
`implement-flow.md`, and say once at Setup `superpowers: not installed,
in-thread`. The procedures are written to stand on their own.

## Phase → skill

| Phase | Skill | When |
|---|---|---|
| Ask first | `superpowers:brainstorming` | Free text or a new ticket with no `--spec`, where the description leaves the design open: criteria would have to be invented, or two or more designs fit. Skipped when a spec or the ticket's acceptance criteria settle what gets built. |
| Plan | `superpowers:writing-plans` | Always. |
| Build | `superpowers:executing-plans` + `superpowers:test-driven-development` | Default (`BUILD=inline`): one vertical red→green slice per behaviour, never all tests first. |
| Build | `superpowers:subagent-driven-development` | Only under `--subagents`. Each task's implementer writes its own failing test first. |
| Build, Verify, Review and fix | `superpowers:systematic-debugging` | A test or check fails for a reason that is not yet known. Find the root cause before changing anything. |
| Review and fix | `superpowers:receiving-code-review` | Every finding, before it is applied or rejected. |
| Verify, Report completion, Ship + PR | `superpowers:verification-before-completion` | Before any claim that a test, check or criterion passes. |
| Track build (two or more tickets) | `test-driven-development`, `systematic-debugging`, `verification-before-completion` | Inside each track implementer. |

## Overrides

These skills were written for interactive sessions. Where one of their
defaults collides with the flow, the flow wins:

- **Questions.** Brainstorming is the flow's one upfront question, not a
  second round of questions. It runs before the first write. Its play-back,
  sizing and builder check happen in that single conversation, and its
  approval gate is the user's answer to it. Every later skill decides
  instead of asking, and logs the decision under the plan's `## Decisions`
  (see **Autonomy** in `implement-flow.md`). Subagent-driven-development's
  `Ruling:` lines go there too, not only in its ledger.
- **Where things live.** Brainstorming's design is written to
  `docs/specs/<branch-description>.md`, not `docs/superpowers/specs/`. It
  becomes `SPEC_FILE` for the rest of the run, as if passed with `--spec`.
  writing-plans writes into `PLAN_FILE` in the shape the **Implementation
  plan** procedure gives, not `docs/superpowers/plans/`. Its header line that
  asks for an execution skill is left out: the flow already chose one.
- **Plan review.** The plan gets a review agent only under `--thorough`
  (**Review the plan**). Subagent-driven-development's pre-flight plan review
  is always skipped.
- **Worktree.** **Set up the branch** has already made the worktree, or
  chose `--no-worktree`. `superpowers:using-git-worktrees` does not run, and
  the build never starts a second one.
- **Commits.** An inline build never commits; executing-plans' and TDD's
  per-step commits are skipped, so the repo's commit hook runs once, over the
  finished change. Under `--subagents`, subagent-driven-development commits
  each task, because its task reviews diff `BASE..HEAD`; those commits stay
  local and follow `bond:authorship-conventions`. Nothing in the build
  pushes. **Ship + PR** commits what is left and pushes. Under `--no-auto`
  the run stops with the work uncommitted (inline) or the task commits
  unpushed (`--subagents`).
- **Reviews.** Subagent-driven-development's per-task reviews stay. They
  gate each task against the plan and the spec. Its final whole-branch review
  does not run: the run's one code-and-security review pair replaces it
  (**Review and fix**).
- **Finishing.** `superpowers:finishing-a-development-branch` does not run.
  **Ship + PR** and **Teardown** finish the branch.
  Remove the plan's `.superpowers/sdd/` workspace before **Report
  completion**, since the final review that would have removed it is skipped.
- **Progress.** The subagent-driven-development ledger tracks tasks inside
  **Build**. The flow's progress file tracks phases. A resume reads both: the
  progress file picks the phase, the ledger picks the task.
