In short:
- Spartan-6 (Nexys3, Atlys) in the Silinx toolchain: a memory the synthesis puts in a block RAM takes a whole RAMB16BWER,
  not a 9K half (RAMB8BWER), for which ISE warns that the initial contents may be incorrect; the stopwatch example now
  builds with no ISE warning on both boards.

In detail:
- The open synthesis for the Spartan-6 runs synth_xilinx's memory step on Yosys's block RAM rule without the 9K halves
  (`packages/silinx-fpga/src/synth-brams-s6.js`); the other examples' netlists are unchanged, a RAMB8BWER the design
  instantiates stays one (#2130).
- The Spartan-6 bitstream writes a RAMB16BWER as ISE's bitgen does (no block RAM frame written again, two bits of the
  frame data cleared), and the bit database has its clock and reset pins, measured against ISE: the seven examples on
  the Nexys3 and the Atlys are byte-identical with ISE's bitgen and DRC clean (#2130).
