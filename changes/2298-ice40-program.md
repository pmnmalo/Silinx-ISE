In short:
- An iCE40 board is programmed from Silinx: Configure Target Device opens Program Flash, which writes the project's .bin into the board's SPI flash. The application uses openFPGALoader; the browser edition uses the board's FT2232H over WebUSB. Neither is tested on a real board yet.

In detail:
- Configure Target Device of an iCE40 project: a page of its own, Program Flash, instead of iMPACT's JTAG chain. Without a .bin it offers to implement the design first (#2298).
- The local server writes the .bin with `openFPGALoader -b ice40_generic` (the iCEBreaker's FT2232H); `/program` takes an iCE40 project's .bin, and `/bitinfo` gives its size (#2298).
- The browser edition writes it itself, as IceStorm's iceprog does, through the FT2232H in MPSSE mode (`core/ftdi-ice40.js`, #2298):
  - the FPGA is held in reset while the flash is written;
  - the blocks the .bin needs are erased, then written a page at a time;
  - the flash is read back and compared;
  - the FPGA is released, and Silinx waits for its CDONE.
