In detail:

- **Placer: the delay table tells a flip-flop's output from a LUT's (#104):** `timing.js delayTable` has a table for
  the connections from a flip-flop (XQ, YQ) and one for the others (`DELAY_KIND`). A flip-flop's output reaches
  every input, its own CLB's too, only through an output multiplexer (OMUX), while X / Y have the CLB's fast
  connects and drive doubles straight from the pin: the one table, the fastest of the four outputs, gave
  0.16 ns for a flip-flop feeding its own CLB, where the route takes 0.45 ns at best, and up to 0.35 ns too
  little near it; the first connection of nearly every critical path was underestimated. On 20 designs of the
  corpus the critical path is 1.1 % shorter (geometric mean, 3 placer seeds each; vtr-ch-intrinsics 6.33 ->
  6.15 ns over 8 seeds), the examples unchanged on the four devices.
