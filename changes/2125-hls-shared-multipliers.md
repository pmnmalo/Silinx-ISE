In short:

- **Silinx HLS shares its multipliers between states:** a sequential function's multiplications, those of the
  floating-point operations too, use the same multiplier blocks in different states, and keep within the device's
  (`pow` in double fits the 4 of a Basys2-100).

In detail:

- **Operators shared between states (#2125):** after the scheduling of #2080, the multiplications of different
  states are bound to one unit of their kind where the period leaves room for its multiplexers, its operands multiplexed by the
  state, in an order that leaves no
  combinational loop; with the device's multiplier blocks (the IDE passes them, `cToHdl`'s `mults`) a cycle takes no
  more, the others waiting for a later one. The report lists the units (their widths, blocks, uses and inputs) and the
  longest path through their multiplexers, which the View C Synthesis Report warns about when over the clock.
