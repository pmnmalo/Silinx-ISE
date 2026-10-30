In detail:

- **Spartan-6: the XC6SLX16's top-half DCMs and PLL (#2025):** the clock paths' PIPs of PLL_ADV_X0Y1, DCM_X0Y2 and
  DCM_X0Y3 measured one at a time against ISE's bitgen (219 PIPs more in the CMT paths' database), and their input
  table's rows; the DCMs' and PLLs' settings measured without the bits of their CLKIN path (which differ by the BUFIO2
  that drives it) nor the PLL's CLKOUT0 enable, now one of its outputs. On the 203 CMT and example designs measured,
  the rules predict 119 bit for bit (65 before) and no bit ISE does not set.
