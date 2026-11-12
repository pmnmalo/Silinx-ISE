In detail:

- **The Spartan-6's Map by nextpnr against Silinx's Map, measured (part of #3139):** every example on the Nexys3 and the
  Atlys through both Maps (2026-11-12, nextpnr-himbaechel-spartan6 0.4.1): the same slices, LUTs and flip-flops (the
  fork packs the very sites of Silinx's Map, with the same timing arcs and chains), every PERIOD met, no warning on
  either; the periods, the best of the flow's 3 seeds, 1.7 % longer on the Nexys3 and 4.1 % on the Atlys on average,
  which is the seeds' spread: over 9 seeds the two Maps' mean periods are within 3 % on every example tried, nextpnr's
  0.4 % shorter on average. The table is in packages/silinx-fpga/research/s6/README.md. test/examples-nextpnr-s6-pack.test.js
  (the Nexys3) and the new examples-nextpnr-s6-pack-atlys.test.js (the Atlys; the file was over 15 minutes with both
  boards and both Maps) now run Silinx's Map too, on the same synthesis, and check nextpnr's against it: the same size, each
  example's period within 15 % (one example's seeds spread that much), the board's within 5 % on average. The ISE tests
  (test/ise/examples.test.js) check the Spartan-6's open flow with nextpnr's Map when SILINX_S6_MAP=nextpnr is set, for
  ISE's verdict (DRC clean, the .bit byte-identical to ISE's bitgen) before nextpnr's Map becomes the default (#3140).
