In short:
- An iCE40 board is programmed from the Silinx application: Configure Target Device opens Program Flash, which writes the project's .bin into the board's SPI flash with openFPGALoader (not yet tested on a real board).

In detail:
- Configure Target Device of an iCE40 project: a page of its own, Program Flash, instead of iMPACT's JTAG chain. Without a .bin it offers to implement the design first. The local server writes the .bin with `openFPGALoader -b ice40_generic` (the iCEBreaker's FT2232H). `/program` takes an iCE40 project's .bin, and `/bitinfo` gives its size. The browser edition says that it does not program an iCE40 yet (#2298).
