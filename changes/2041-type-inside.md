In short:

- In the schematic editor, a symbol's type (AND2, OR3, INV, M2_1…) is drawn inside its shape, and the name you give it
  stays above it.

In detail:

- **The symbol's type inside its shape (#2041, correcting #2036):** web/js/sch-svg.js draws a gate's, an inverter's,
  a buffer's and an upright multiplexer's type at its body's centre (a triangle's near its base), 8 px bold, a type a
  little long for the body squeezed to it (NAND3B3); else under it as before (a turned inverter; BUFE / BUFT, whose
  triangles are too small; a turned multiplexer's above it). The instance name is above the symbol again, as before
  #2036 (whose change, the name inside, is undone). Tests: test/ui/sch-labels.test.js (both interfaces),
  test/web-sch-svg.test.js, test/ui/sch-gate-width.test.js.
