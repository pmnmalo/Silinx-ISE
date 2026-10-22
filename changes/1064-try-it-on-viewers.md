In short:

- **Try it on the RTL and the Technology Schematic:** View RTL Schematic and View Technology Schematic have the
  schematic editor's Try it: click the inputs (switches, bus values, the clock's Step or Run) and watch the
  circuit work, its wires and pins coloured by their values, inside an instance too; Esc stops.

In detail:

- **Try it on the read-only viewers (#1064):** the drawing of the RTL Schematic (the elaborated design) or of
  the Technology Schematic (the synthesized netlist's device cells: LUTs, flip-flops, carry chain, buffers) is
  simulated live with the design's sources or the netlist's primitive models, and the values of the instance's
  generics; on gates and blinky the outputs equal the RTL simulation's. Try it on a drawing whose module's file
  defines other modules too (the netlist, a module with its submodules) keeps them; the device primitives'
  clock pins (through IBUFG / BUFG) make a clock input steppable.
