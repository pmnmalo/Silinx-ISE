In short:

- **The ULX3S programmed from the browser:** the browser edition loads the ULX3S's ECP5 over WebUSB too (Chrome or Edge),
  through its FT231X: every board of the other families is now programmed from the browser and from the local server.

In detail:

- **JTAG through the ULX3S's FT231X over WebUSB (#2298):** core/ft231x-jtag.js, the FT231X in bit-bang mode (it has no
  MPSSE) on the board's pins (TCK on DSR, TMS on DCD, TDI on RI, TDO on CTS, as openFPGALoader's ulx3s and ujprog wire it),
  two bytes a clock, asynchronous when nothing is read, synchronous in pieces that fit its 512-byte RX FIFO when TDO is: a
  JTAG port with the Adept's methods for core/adept.js's chain and sequences, which knows the ECP5s' IDCODEs. The ECP5's SRAM
  loaded as Lattice's sysCONFIG says (ISC_ENABLE for the SRAM, ISC_ERASE and its BUSY waited for, LSC_INIT_ADDRESS,
  LSC_BITSTREAM_BURST of the .bit from its preamble on, the configuration check in the status, ISC_DISABLE, DONE). The ULX3S's
  programmer webusb 'ft231x' (core/usb-program.js: the .bit's part and IDCODE checked first, as the server does); a device
  granted before is taken only when its product is the board's (web/js/api-local.js). Tests: test/ft231x-jtag.test.js and
  test/usb-program.test.js against test/fixtures/ft231x-sim.js (the FT231X's bit-bang modes, its FIFO; the TAP and an ECP5 model
  in test/fixtures/ftdi-jtag-sim.js), UI standalone-program (blinky's .bit made in the browser, then loaded; both interfaces).
  Proven with stand-ins only: not yet on a real ULX3S.
