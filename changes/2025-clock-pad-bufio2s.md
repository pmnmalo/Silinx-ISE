In detail:

- **Spartan-6: the clock pads' BUFIO2s (#2025):** the clock paths from every pad measured into a DCM or a PLL now
  match ISE's bitgen, including pads whose BUFIO2 had not been measured with that DCM or PLL. On the XC6SLX16's 203
  CMT and example designs, every bit is predicted (196 before).
