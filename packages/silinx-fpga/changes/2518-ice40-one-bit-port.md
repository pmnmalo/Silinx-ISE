In detail:
- The iCE40's back end: a port that is a vector of one bit takes its PCF's `set_io` and `set_frequency` named either `btn[0]` (as a board's constraints write it) or `btn`, nextpnr-ice40's name; before, `btn[0]` was an unmatched constraint and the port was placed anywhere (#2518).
