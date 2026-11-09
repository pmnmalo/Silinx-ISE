In short:

- **Spartan-6 (Nexys3, Atlys):** a design whose outputs have no LOC routes again. Place & Route had failed on every seed
  when Silinx put such an output on a pad of the top bank that nextpnr cannot reach.

In detail:

- **A port without a LOC takes a pad whose I/O path is known (#3152).** nextpnr's chip database leaves out the PIPs
  whose bits Silinx's bit database does not know. One of them is the slave OLOGIC2's D1 -> OQ route-through in the top
  bank's TIOI_INNER tiles (the master's is known), so 30 pads of the XC6SLX16 and 23 of the XC6SLX45 can take no
  output, and 4 pads of each can take no input. Silinx's placer gave such pads to ports without a LOC, and nextpnr
  failed on every seed: `Failed to route arc 0.0 of net …, from X6Y4/L_AQ to X5Y0/TIOB_O3_PINW`. The new module
  `fpga/s6/pad-paths.js` (`padPathsS6`) finds each pad's paths through the known PIPs, in about 0.1 s. Probed
  pad by pad, nextpnr agrees on both parts. The placer now gives ports without a LOC only pads with their path. The examples, all
  of their ports LOC'd, are placed as before, so their bitstreams are unchanged.
