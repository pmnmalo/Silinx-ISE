In detail:

- **Spartan-6: designs with distributed RAMs and shift registers placed and routed (#1153):** the Silinx toolchain no
  longer stops at the placement of a Nexys3 or Atlys design with a small memory or shift register the synthesis puts
  in LUTs; the bitstream of their contents other than zeros is #2556. Test: test/s6-xdl-mem.test.js.
