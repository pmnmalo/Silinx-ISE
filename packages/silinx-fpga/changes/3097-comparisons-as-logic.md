In detail:

- **A signal compared with several constants as LUTs, not as carry chains (#3097):** synth_xilinx's coarse step puts a
  comparison with a constant of a signal wider than 4 bits on a carry chain (cmp2lcu); a design comparing one signal with
  many constants (itc99's b05: 40 comparisons of a 9-bit TM, `TM > 99`, `TM > 89`, …) has as many short chains, whose S
  LUTs are the same functions of the signal: each chain needs its own copy (nextpnr's packer made 127 on b05) and a chain
  of three stages leaves half a slice empty. Such comparisons are now gates before that step (synth-cmp.js: CMP_MAP, proved
  equal to Yosys's cells by SAT), and ABC shares their terms; so are those that are an OR of the signal's high bits
  (`prescale_reg > 0`). A comparison alone keeps its chain (faster on a wide signal). The comparisons are found by a run up
  to the coarse step (cmpProbe, about 0.7 s on blinky). On the corpus (13 designs change): itc99-b05 252 → 194 slices,
  verilog-uart 117 → 111 and 8.68 → 6.94 ns, itc99-b11 96 → 89, secworks-sha1 1006 → 962; slices −2.5 % (geometric
  mean), the critical path +0.3 %; itc99-b15 1233 → 1394 slices (the netlists the mappings after it keep, faster by the
  estimate, change). The vga example 143 → 122 slices, 10.2 → 9.2 ns; the stopwatch 198 → 194. The packer was not the
  cause: nextpnr fills a slice with 1.9 LUTs on both designs, as on the rest.
