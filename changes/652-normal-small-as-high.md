In short:

- **Faster small designs at Optimization Effort Normal with the Silinx toolchain:** a design of 250 LUTs at most is also
  synthesized as at High, and that netlist kept when it is no slower: 8 % shorter critical paths on the designs it
  changes (up to 19 %), by ISE's timing analyser, for 2-3 s more of synthesis.

In detail:

- **Normal synthesizes a small design as High does too, the faster kept (#652):** High's mappings (the depth-oriented
  ones, the state machines one-hot, the speedup, the critical LUTs made shallower) were tried at Normal only on a design
  limited by its depth; by ISE's trce they make the corpus's designs of 500 LUTs at most 2.5 % faster than Normal's
  netlists, up to 19 %. At Normal a design whose usual mapping has `SMALL_RULE.maxLuts` (250) LUTs at most is now
  synthesized both ways, side by side (`core/synth-open.js`), and High's netlist kept when the estimate says it is no
  slower than Normal's (itc99-b08's, 13 % slower by the estimate, was 15 % slower by trce: Normal's kept); the console
  says which. Normal's place and route is unchanged. Measured: 16 routings of the corpus and the examples change at
  Normal; by ISE's trce on the 14 timed ones 8.0 % faster in geometric mean (2.0 % over the 57 timed designs): epfl-router
  and itc99-b10 −19.3 %, itc99-b13 −18.0 %, iwls05-sasc −16.8 %, the traffic example −12.6 %, verilog-uart −9.7 %,
  verilog-i2c-master −8.4 %, itc99-b07 −8.2 %; three slower by 4 % at most (verilog-lfsr-crc, itc99-b09, the stopwatch
  example); every bitstream byte-identical to ISE's bitgen with a clean DRC. A small design's synthesis takes 2-3 s more
  (blinky 2.0 → 4.3 s). The Process Properties' note on the effort says so, in English and in Portuguese; README and
  docs/PROJECT.md too.
