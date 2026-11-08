In detail:

- **A signal compared with several constants as LUTs, not as carry chains (#3097):** synth_xilinx's coarse step puts a
  comparison with a constant of a signal wider than 4 bits on a carry chain (cmp2lcu); a design comparing one signal with
  many constants (itc99's b05: 40 comparisons of a 9-bit TM, `TM > 99`, `TM > 89`, …) has as many short chains, whose S
  LUTs are the same functions of the signal: each chain needs its own copy (nextpnr's packer made 127 on b05) and a chain
  of three stages leaves half a slice empty. Such comparisons, and those that are an OR of the signal's high bits
  (`prescale_reg > 0`), can now be gates before that step (synth-cmp.js: CMP_MAP, proved equal to Yosys's cells by SAT),
  whose terms ABC shares; a comparison alone keeps its chain (faster on a wide signal). A run up to the coarse step finds
  them (probeComparisons, about 0.7 s on blinky; none without a `<` or `>` in the text); the design is then synthesized
  both ways, side by side, and the one with them as logic kept when it has fewer slices and gains at least as much in
  slices as it loses in speed by the estimate (keepCmp, r.depth.cmp): the mappings after the chains gone, chosen on the
  estimate, gave itc99-b15 13 % more slices once placed and secworks-sha1 a path 15 % slower, which keep their netlists
  now. On the corpus (8 designs change): itc99-b05 252 → 194 slices, verilog-uart 117 → 111 and 8.68 → 6.94 ns,
  itc99-b11 96 → 89 and 9.10 → 8.14 ns, itc99-b21 38.8 → 35.2 ns; slices −3.3 %, the critical path −2.1 % (geometric
  means of the 13 designs that have such comparisons). itc99-b05's path 10.9 → 12.1 ns (8 % by the estimate, for 24 % fewer
  slices: its faster depth-oriented mapping, 9.8 ns and 209 slices, not kept by DEPTH_RULE). The vga example 143 → 122
  slices, 10.2 → 9.2 ns; the stopwatch 198 → 194. The packer was not the cause: nextpnr fills a slice with 1.9 LUTs on
  both designs, as on the rest.
