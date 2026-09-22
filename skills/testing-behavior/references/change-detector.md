# Why a change-detector test is worthless

A test exists to answer one question: **does the code do what a caller is
entitled to expect?** That expectation — the contract — is the thing you assert.
Not the line count, not the private helper names, not the exact shape of an
intermediate value the implementation happens to build today.

The failure mode this skill prevents is the **change-detector test**: a test
written by reading the implementation and asserting back exactly what it
currently produces. It passes today, fails the moment anyone refactors (even
when behaviour is unchanged), and — worst of all — if the code has a bug, the
test faithfully locks the bug in. A change-detector test gives the green check
of "tested" while protecting nothing.

A good test is the opposite on both axes:

- It **fails when behaviour is wrong** — including the bug that's there now.
- It **survives a legitimate refactor** — same inputs, same observable outputs,
  green, even if every internal line changed.

If a refactor that preserves behaviour breaks your test, the test was coupled to
implementation. If a behaviour bug leaves your test green, the test was a
tautology. Aim between those.
