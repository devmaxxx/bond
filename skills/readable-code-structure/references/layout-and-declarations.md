# Layout and declarations

- A blank line between functions, between class members, and between the logical blocks inside a function.
- Named functions are `function name()` declarations, not `const name = () =>`; inline callbacks stay arrows.
- No `await` inside a ternary or a `??`, and no nested ternaries — write the `if` blocks. A plain `x ? a : b` stays.
- Types and logic shared by more than one module live in their own files, not inside a large module.

Enforce with the linter where a rule exists (`curly: all`, `func-style: declaration`); review covers the rest.
