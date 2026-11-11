In short:

- **Long if … elsif / else if chains synthesize:** a chain of a few hundred branches or more (a table written as an if
  chain, a case of many ranges) stopped the open synthesis with "Yosys failed: memory access out of bounds" (from 250
  branches) or "Maximum call stack size exceeded" (from 1000); a chain of 2000 branches synthesizes, in VHDL and
  Verilog, with no warnings.

In detail:

- **Long chains in the synthesis input (#3374):** Yosys's Verilog front end nests an else if per branch and overflowed
  its stack (in WebAssembly) from 250 branches; written as a flat `case (1'b1)`, its muxcover pass overflowed on the
  chain of multiplexers from 1000. The synthesis input (packages/silinx-hdl/src/synth-stmts.js `splitChain`) writes a
  chain of more than 32 branches (an if … else if / elsif chain, a case of ranges) as an if of its halves, the first
  taken when one of its conditions is true (a reduction `|` of their concatenation), each half the same way down to
  chains of 32 at most: nested, and its multiplexers as deep, as the log of its length. The same branch is taken; a
  half but the last has its last branch as its else (Yosys saw a way through it that assigns nothing: a latch of a
  combinational process). A chain of 32 branches or fewer is written as before: the repository's 230 synthesis inputs
  are the same. Tests: test/long-if-synth.test.js (the halving's text and order; the synthesis inputs of 32, 33 and
  20 000 branches; chains of 2000 branches in VHDL and Verilog and a VHDL case of 100 ranges synthesized with no
  warnings, their netlists simulated against the designs), test/deep-if-chain.test.js (the synthesis input of 20 000
  branches halved).
