In short:

- **Banks' VCCO:** two LOC'd I/Os of one bank whose I/O standards need different VCCO fail at Place & Route, as ISE's
  DRC refuses them, no longer giving a bitstream ISE would not.

In detail:

- **The LOC'd I/Os of a bank share its VCCO (#2813).** Before nextpnr runs, Place & Route checks the I/Os the
  constraints LOC on pads (`bankVccoConflicts`, open-flow-nextpnr.js): an I/O whose I/O standard needs another VCCO
  than the bank's first LOC'd I/O (ISE's default LVCMOS25) stops it, as ISE's PhysDesignRules:755 and Silinx's old
  placer did: `place: q<0>: pad A10 is in bank 0, whose other I/Os (clk on B8, LVCMOS33) need VCCO 3.3 V, not 2.5 V
  (LVCMOS25)`. The I/Os nextpnr places itself already went to a bank of their VCCO.
