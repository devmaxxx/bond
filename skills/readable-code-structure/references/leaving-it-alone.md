# When to leave it

- **A clear, short function** — even if it does two small things, if it already
  reads at a glance, extracting helpers just adds indirection. Readability wins.
- **A genuinely sequential procedure** where every line depends on the previous
  and there's no meaningful sub-step to name. Splitting it scatters the story.
- **Hot paths** where an extra function call or a different data structure would
  measurably hurt — but reach for this rarely and only with evidence; modern JS
  inlines small calls.
- **Over-extraction already present** — a helper used exactly once, named the
  same as the line it wraps (`addOne`, `getX`), that you have to jump to in order
  to read the caller. Inlining it back is the readable move.

# How to apply

- **Preserve behavior exactly.** This is a structural refactor — same inputs,
  same outputs, same errors. Don't smuggle in logic changes.
- **Extracted pure logic belongs in the right home.** Calculation (pricing,
  totals, fees, date math, availability) moves to a domain service or a shared
  module, never inline in a controller or a UI component. Route money and
  calendar math through the project's value objects / utilities rather than
  hand-rolling floats and raw `Date` arithmetic.
- **Name for the domain.** Keep identifiers in English; the name should describe
  the intent (`assertValidStay`), not the mechanism (`checkDates2`).
- **Brace every block you touch** and avoid re-introducing redundant passes —
  both rules above apply to the code this refactor produces, not just the code
  it started from; let the formatter settle layout.
