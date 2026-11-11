In detail:

- The Spartan-6's PIPs that ISE has measured but that nextpnr's chip database does not have yet are kept in a file of
  their own (`bitdb/s6/s6-pips-held.json`). The chip database's generator reads it; Silinx's flow does not, so the pads
  that would need those PIPs still take no input or output (#3349).
