In short:

- **VHDL constants of unconstrained array types:** `constant C : t := ("00", "01");` takes the bounds of its
  value; a loop over `C'range` no longer stops the elaboration, and a string constant's `'range` is supported.

In detail:

- **A VHDL constant of an unconstrained array type takes the bounds of its value (#2548):** a positional
  aggregate's from the index subtype's left bound (`natural range <>`: 0 to n - 1, `positive range <>`: 1 to n),
  a named one's from its choices (a gap in them is an error), a bit-string literal's 0 to n - 1 (so `B(0)` is its
  first bit), a string's 1 to n; `'range`, `'reverse_range`, `'length`, `'left`, `'right`, `'low` and `'high` are
  those bounds. The constant kept the unconstrained type and its `'range` crashed the elaboration ("Cannot
  convert undefined to a BigInt").
