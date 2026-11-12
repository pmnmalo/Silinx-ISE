In short:

- **Silinx HLS: a global in a function inlined.** A function the top calls that reads a global variable now reads its
  current value in the hardware, as the C does (it read the value at the reset from the second call on, with no
  warning); one that writes it in a fully unrolled loop is made, no longer refused as "'g' is a constant".

In detail:

- **A global of a sequential module in a function inlined into it (#3511):** a call evaluated in place (a function with
  no loop, in a plain call, a loop, a pipelined loop or a fully unrolled one, or one with INLINE off kept inlined) ran
  the callee with its own scope only, so a global it named fell to a slot of its initial value: a read gave the reset's
  value, a write was "'g' is a constant". The module's globals (a register, the registers of a partitioned array, a
  memory) are now kept apart (`globalOwn`, core/c-fsmd.js) and a name the callee does not declare is looked up there
  before a constant's slot (`ownGlobal`, core/c-dataflow.js): the callee reads and writes the top's own storage. The HLS
  corpus and the repository's C designs make the same HDL. Tests: test/c-inline-globals.test.js (a plain call, a loop,
  a pipelined loop, a fully unrolled loop writing the global, INLINE off kept inlined, a global array of registers and
  of a memory, a callee calling another, a local of the same name: the C model, the HDL with its exact warnings, the
  co-simulation in VHDL and in Verilog).
