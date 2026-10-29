In short:

- The handwritten expression is read in the truth table editor's notation: /A.B + C, not A'·B + C.

In detail:

- **The handwritten expression in the editor's notation (#2001):** what the Handwritten Expression dialog reads, when
  it parses, is shown and inserted in the slash notation of the truth table editor (core/logic.js
  `formatExpr(…, 'slash')`): `F = /A.B + C`, a bar over a group `/(A + B)`; a text that does not parse stays as
  written, for the user to correct. `recognizeExpression` (core/ink/expression.js) also returns `written`, the
  text as written (its letters' case, its primes), which the flip-flops' labels read. Tests: test/ink.test.js
  (the notation, the same function as written; the text as written when it does not parse), test/ui/ink.test.js.
