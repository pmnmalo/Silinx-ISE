In detail:

- **A one-bit bus's UCF name in linear time (#2318).** `portAssignments` found the bus x of a NET name x<0> (x(0), x[0])
  with a RegExp that took quadratic time on a name with a long run of spaces (CodeQL's js/polynomial-redos); `oneBitBase`
  finds it from the bit's end, in linear time, with the same result on every name. Tests: test/ucf.test.js.
