In short:

- **Synthesis:** in a design of several clocks, each clock's critical path is made shorter, not only the slowest clock's.

In detail:

- **Each clock's own critical path made shorter by the open synthesis (#652):** a design of several clocks has the
  critical LUTs of every clock made shallower, not only the slowest clock's. vtr-stereovision3's `tm3_clk_v0` 10.9 %
  shorter at Speed by ISE's trce (5.958 -> 5.306 ns) and 9.0 % at Area, its counter's enable on 2 levels of LUTs as
  XST's, with the same size; the toolchain's package's changelog has the details.
