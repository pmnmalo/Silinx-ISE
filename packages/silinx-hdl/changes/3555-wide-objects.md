In detail:

- **A limit on an object's size (#3555):** `MAX_BITS` (2**24) bits for a type or an expression's result, and
  `MAX_ELEMENTS` (2**22) elements for an array, counting every level of an array of arrays (src/util.js). Past them,
  one error at the declaration or the expression ("the type is N bits wide, more than the limit of 16777216 bits",
  "array too large (N elements)"), checked before any value is made. A vector aggregate is built by runs of equal
  bits, `V.repl` by doubling and `V.fromBits` reads a long literal at once (each was quadratic in its width).
