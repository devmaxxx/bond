# Review a PR

The one way a command reviews a pull request. Code review and security review
always run together, on the same head; a command names this procedure, never
one of the two agents alone.

Inputs: the PR number, its head sha, its base, and the checkout to read from.

1. **Spawn both agents in one message**, so they run in parallel:
   - `bond:pr-review` — correctness, tests, the repo's own rules;
   - `bond:security-review` — access control, injection, secrets, the rest of
     its list.

   Each gets target `pr #<n>`, the head sha and the checkout path. Neither
   needs the head checked out: both diff `origin/<base>...<head sha>` and read
   files at that sha.
2. **One list.** Merge the two reports, ranked most severe first, each line
   tagged `code` or `security`. A defect both report is one line, tagged
   `security`.
3. **Blocking.** Any `critical` or `high` finding from either agent blocks: the
   PR is not merged, marked ready or verified until it is fixed. `medium` and
   `low` are fixed or listed, as the calling command says.
4. **Freshness.** The review holds for the head it ran on. A new commit ⇒ run
   both again. Where the command keeps a ledger, it records
   `"reviewed": "<head sha>"` once both reports are in, and a re-run on that
   head skips the review.

What the caller does with the list — fix it (`/bond:ship-pr`) or report it
(`/bond:sweep-pr`) — is the caller's.
