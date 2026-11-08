In short:

- **Optimization Speed is quicker on a large design:** Place & Route makes 4 placements of a design of over 500 slices, not
  8, about half the time, with the same period on the designs measured.

In detail:

- **Optimization Speed: four placements over 500 slices (#3095):** the nextpnr engine's placements at Speed are 32 up to
  100 slices, 8 up to 500, and 4 above. On itc99-b20 and secworks-siphash, the best of 8 was the best of 4. itc99-b20's
  Place & Route goes from 48 to about 24 minutes.
