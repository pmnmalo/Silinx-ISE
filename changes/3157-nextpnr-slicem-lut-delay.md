In short:

- **The nextpnr engine's placements a little faster:** the placer knows that a LUT on a SLICEM is slower than one on a
  SLICEL, and keeps the critical paths' LUTs off the SLICEMs.

In detail:

- **The Spartan-3E's nextpnr engine at 1.4.2 (#3157).** nextpnr-himbaechel-spartan3e 1.4.2 (nextpnr-spartan PR 30,
  40a7f9b3): the placer's estimate of a connection from a SLICEM's LUT is 55 ps longer (Tilo 0.759 ns against a SLICEL's
  0.704 at -4, `fpga/timing.js` SPEED_4); the chip database's LUT4 has a SLICEL's arc on every site. Natively, XC3S1200E,
  the mean period of one placement per seed: fpu-adder 10.975 -> 10.714 ns (-2.4 %, seeds 1-4), iwls05-sasc 4.780 ->
  4.731 ns (-1.0 %) and iwls05-simple-spi 6.548 -> 6.478 ns (-1.1 %, seeds 1-16). Part of #2982, which stays open.
