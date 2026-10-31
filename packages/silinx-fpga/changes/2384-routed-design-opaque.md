In detail:

- **The routed design is the back end's (#2384):** `runFlow` no longer reads or names `open/routed.xdl`; a back end keeps its
  routed design in its own format and file, and its timing, bitstream, power and FPGA view read it again from an earlier run
  (`runFpgaView`, `routedOrEarlier` and `routedText` for the simulation models). The Spartan-3E and Spartan-6 give the same
  output; a fake family routes to a format of its own in the tests. A registered back end no longer receives `setRouted`,
  `routedText` or `routedOrEarlier` in its context.
