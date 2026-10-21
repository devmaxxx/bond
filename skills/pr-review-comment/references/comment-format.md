# Comment format

One PR comment, Markdown, plain prose. Full sentences a reviewer can act on
without asking back; no caveman compression, no emoji, no praise, no AI
signature or "generated with" line.

## Shape

```markdown
## Review — <ticket or PR title> (vertical + horizontal)

Reviewed after merging current `<base>` (`<short sha>`) into the branch.
<Data sources: "Volume figures come from a read-only query against <env>
(<table>, last <window>)." — or "No production data was queried.">

**Verdict: <mergeable as is | mergeable after N should-fix | needs rework> —
<the one finding that decides it, in one clause>.**

### <Lens> — <OK, or its most severe finding: blocker | should-fix | minor | nit>
- <the fact or the finding, with numbers and their unit>

### <next lens> — …

Vertical findings:
- <Layer> (<severity>): <what breaks, in which scenario> (`file` / `symbol`).
  Suggest <fix>.

Horizontal findings:
- <Kind swept> (<severity>): <siblings checked>; <the one that drifted>.

Open questions:
- <a decision only a human can make>
```

## Rules

- **Verdict first.** Right after the method and data-source lines, the
  verdict says whether it can merge and which finding decides it. Details
  follow.
- **One section per lens** run (volume, idempotency, concurrency, write paths,
  rollback, migrations…), headed with its outcome. OK sections stay one or two
  bullets.
- **Severities:** blocker (wrong data, outage, security) · should-fix (fix
  before merge; a real failure scenario) · minor (fix soon or in a follow-up)
  · nit (style, naming) · OK (checked, nothing found). A rollback gap is
  tagged "release note, not a code change".
- **Every finding** carries the layer, the file or symbol, the concrete
  scenario that fails (input, timing, data), and a suggested fix.
- **Numbers carry their source and unit.** An unmeasured figure says so.
- **Stale description claims** are quoted and corrected with the current
  figure.
- **Open questions** are only what the reviewer cannot settle: a staging or
  non-production run before release, an alert for a failure mode that becomes
  silent, an owner decision. Not a place to park unverified findings.
- If a pass found nothing, say so: "Horizontal findings: no sibling drift."

## Example (generic)

```markdown
## Review — PROJ-123 (vertical + horizontal)

Reviewed after merging current `main` (`a1b2c3d`) into the branch. Volume
figures come from a read-only query against prod (`audit_log` on `orders`,
last 7 days).

**Verdict: mergeable after 1 should-fix — the per-order sync can drop an
update for up to 24 h; plus a rollback note for the release.**

### Volume / rate limit — OK
- Prod, last 7 days: 1,740 writes (~250/day); peak hour 115, peak minute 12.
  At 4 API units per sync that is at most 48 units in the worst minute against
  54/min from the 1100 ms throttle.

### Concurrency — should-fix
- See Workers below.

Vertical findings:
- Workers (should-fix): the per-order job uses a cancel-newest strategy with
  one run per key. An update that arrives while that order's run executes is
  dropped, and the remote copy stays stale until the nightly pass. Suggest a
  strategy that keeps the latest request (round-robin or queue-latest).
- API (minor): `deleteOrder` does not request a sync, so deleted orders stay
  published until the nightly pass.
- Workers / rollback (release note, not a code change): the interval cron is
  deleted on deploy; rolling back does not recreate it. Rollback step:
  re-register the cron by hand.
- Domain (minor): the description's "590 rows" is now 812 in prod.

Horizontal findings:
- Sync trigger call sites: create, update, bulk import and the partner bridge
  all request a sync after commit; `deleteOrder` is the one write path missing.

Open questions:
- Is there a non-production target where the first post-deploy syncs can run?
- With the interval cron gone, should anything alert if the nightly pass does
  not run?
```
