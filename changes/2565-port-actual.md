In short:

- **A port map's actual, as XST reads it:** Check Syntax now reports a VHDL port connected to an expression
  on a signal (`a & b`, `a and b`, `n + 1`) or to a signal's element indexed by a signal (`s(i)`), which
  XST rejects; a signal, a static slice, a conversion, `not s` and a constant expression are still accepted.

In detail:

- **The actual of a VHDL port (#2565):** an operator on a signal, or a name indexed by a signal, in a port
  map's actual is an error of the elaboration (`core/vhdl/actual.js`), as XST's HDLParsers:864 and :852 on
  Spartan-3E; the verdicts of 19 actuals checked against ISE 14.7. Its hint (English and Portuguese) says to
  assign the expression to a signal first. The compiled simulator's `prims.vhd` test design does so for its
  block RAMs' addresses.
