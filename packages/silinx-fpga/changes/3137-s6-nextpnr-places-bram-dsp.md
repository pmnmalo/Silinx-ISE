In detail:

- **The Spartan-6's nextpnr engine: nextpnr-himbaechel-spartan6 0.2.0, which places the block RAMs and DSP48A1s (#3137).**
  The package's chip database gives each routing node its delay from Silinx's timing model (#3149), and its annealing
  refinement after HeAP now reaches 40 tiles (60 passes, temperature 0.01, criticality exponent 4). It also fixes a
  placer hang, a SLICEM cell legalised onto a SLICEL (micro80 on the Atlys). `S6_HARD_BY_NEXTPNR`
  (`src/open-flow-nextpnr-s6.js`) is now true, so Silinx fixes only the pads and the global buffers; with
  `hardByNextpnr: false` Silinx still places the block RAMs and DSP48A1s itself. The examples' periods (Optimization
  Speed, best of 3 seeds, Silinx's timing analysis) are 3.2 % shorter on average on the Nexys3 and the Atlys, with
  every PERIOD met (#2798).
  - **Tests:** test/nextpnr-s6.test.js (a block RAM and three DSP48A1s free by default, fixed with
    `hardByNextpnr: false`), test/examples-nextpnr-s6.test.js (stopwatch and micro80 on both boards: every seed
    routes, the PERIOD met, no warnings).
