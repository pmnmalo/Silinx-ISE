In detail:

- **One model of the constraints (#2385):** `constraints.js`: the pins, the clocks and what is not portable (as the format's
  own text), read by the format a back end says (`constraints: { id, read, write }`, UCF when it says none). `runFlow` and the
  steps no longer read UCF: a back end receives `ctx.constraints()`, the model or null, in place of `ctx.ucfText`. The
  Spartan-3E and Spartan-6 give the same output; a fake family reads a format of its own in the tests.
