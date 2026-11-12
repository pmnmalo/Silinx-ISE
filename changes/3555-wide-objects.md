In short:

- **Objects too large:** a vector, an array, a string or an expression of more than 16 Mbits (2**24 bits), or an
  array of more than 4M elements counting every level of an array of arrays, is an error of the file at its
  declaration or expression: "the type is N bits wide, more than the limit of 16777216 bits". A few hundred bytes of
  source, such as `(others => a)` on a vector of a thousand million bits, array types nested 40 levels deep or a
  Verilog `{4000000000{a}}`, ran the elaboration out of memory or threw out of it.

In detail:

- **A limit on an object's size (#3555):** only an array type's number of elements was limited (4M). The
  elaboration now limits an object's bits to `MAX_BITS` (2**24: a vector's width, an array's elements times their
  width, a record's fields, a string's characters at 8 bits each, the result of an expression such as a
  concatenation or a replication) and an array's elements, counting those of every level of an array of arrays, to
  `MAX_ELEMENTS` (2**22, the old limit of one array). Both are checked before any value is made, and each gives one
  error of the file at the declaration or the expression, for Check Syntax, the simulation and the synthesis input.
  The repository's largest object is 40 960 bits (a memory of 4096 elements of 10 bits) and the supported devices'
  largest block RAM 4.9 Mbits. A vector of the limit's width costs 2 MB, and an array of 4M elements about 2 s and
  600 MB. A vector aggregate is built as runs of equal bits, not one entry per bit; a replication is built by
  doubling and a long bit literal is read at once (each was quadratic in its width). An aggregate's choices outside
  the array are no longer walked, and a slice of more than 4M elements (a constant one, or one of run-time bounds
  in the simulation) is an error. The repository's HDL files and the design corpus elaborate, check, simulate and
  make their synthesis input as before. Tests: test/wide-objects.test.js (VHDL and Verilog: at the limits, no
  warnings, simulated, the synthesis input; one past them and the issue's cases, the exact errors, at once; the new
  literals and replications against the old bit-by-bit forms); test/grade-server.test.js's Memory Limit Exceeded
  design, within the new limits.
