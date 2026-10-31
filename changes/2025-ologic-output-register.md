In detail:

- **Spartan-6: an output register in the pad (#2025, #2372):** an output flip-flop that ISE packs into a pad's I/O logic
  (OLOGIC2) is now measured against ISE's bitgen at every site of the XC6SLX16 and the XC6SLX45, along with its clock's
  path. On the XC6SLX16's 203 CMT and example designs the rules predict 196 bit for bit (122 before). A top pad's output
  no longer predicts a bit that ISE does not set.
