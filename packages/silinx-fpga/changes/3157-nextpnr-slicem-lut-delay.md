In short:

- **nextpnr-himbaechel-spartan3e 1.4.2:** the placer charges a SLICEM's LUT its slower delay.

In detail:

- **nextpnr-himbaechel-spartan3e 1.4.2 (#3157).** nextpnr-spartan's PR 30 (40a7f9b3): the placer's estimate of a
  connection from a LUT on a SLICEM is 55 ps longer, a SLICEM's Tilo (0.759 ns against a SLICEL's 0.704 at -4). The
  timing analysis, the router and the chip database are unchanged. fpu-adder's mean period -2.4 %, iwls05-sasc's
  -1.0 %, iwls05-simple-spi's -1.1 % (natively, XC3S1200E).
