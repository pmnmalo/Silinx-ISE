In detail:

- **The Spartan-3E through nextpnr-himbaechel, a spike (#1954):** research/nextpnr-s3e: a `spartan3e`
  micro-architecture of nextpnr (in a fork, branch `silinx-s3e`) whose chip database is built from Silinx's device
  graph, leaves out the PIPs whose bits Silinx's bit database does not know and takes Silinx's delay model (fitted to
  ISE's trce); it packs LUTs and flip-flops into slices and permutes the LUTs' inputs. research/nextpnr-s3e/lib.mjs
  writes nextpnr's routed design as XDL for Silinx's bitgen, checks it against the netlist by simulation, and exports
  the PIPs and the delays for the chip database. A counter on the XC3S250E: ISE's DRC clean, Silinx's .bit
  byte-identical to ISE's bitgen and run on a Basys2, 19 slices as Silinx's, 7.15 ns against Silinx's 6.72 ns.
  Tests: test/nextpnr-s3e.test.js.
