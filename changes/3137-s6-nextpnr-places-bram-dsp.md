In short:

- **Spartan-6 (Nexys3, Atlys):** Place & Route gives shorter clock periods, about 3 % on average over the examples and
  up to 15 %. nextpnr now places the block RAMs and DSP48A1s itself.

In detail:

- **The Spartan-6's nextpnr engine: nextpnr-himbaechel-spartan6 0.2.0, which places the block RAMs and DSP48A1s (#3137).**
  Its chip database has each routing node's delay from Silinx's timing model (#3149). The annealing refinement after
  its analytical placer reaches 40 tiles, so a block RAM or DSP48A1 moves next to its logic. Silinx no longer places
  them and fixes them for nextpnr (`S6_HARD_BY_NEXTPNR` true). The examples' periods (Optimization Speed, best of
  3 seeds) are 3.2 % shorter on average on the Nexys3 and the Atlys, with every PERIOD met; for example the stopwatch on
  the Nexys3 went from 9.959 to 8.941 ns and micro80 on the Atlys from 8.843 to 8.613 ns.
