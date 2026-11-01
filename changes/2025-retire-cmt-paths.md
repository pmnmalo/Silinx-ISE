In detail:

- **Spartan-6: a DCM's or PLL's bits by the same rules at every site (#2025):** a DCM or PLL at the one site measured
  whole in #727 set a few bits ISE's bitgen does not when it drove other BUFGMUXes; it is now predicted as at any other
  site. On the XC6SLX16's 203 CMT and example designs, every bit matches ISE (199 before).
