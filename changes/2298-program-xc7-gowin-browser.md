In short:

- **The Basys 3, the Nexys A7 and the Tang Nano 9K programmed from the browser:** the browser edition loads their FPGA over
  WebUSB, as it does the Basys2's (Chrome or Edge): iMPACT's Program FPGA on the Basys 3 and the Nexys A7, Configure
  Target Device on the Tang Nano 9K.

In detail:

- **JTAG through an FT2232H over WebUSB (#2298):** core/ftdi-jtag.js, the FT2232H's MPSSE (FTDI AN_108) as a JTAG port
  with the Adept's methods, so core/adept.js's chain and sequences drive it: the 7-series configured with the Spartan-3E's
  sequence (configureXilinx, out of programAdept, UG470's JPROGRAM / CFG_IN / JSTART), the Basys 3's and the Nexys A7's
  Digilent USB-JTAG; the Tang Nano 9K's GW1NR-9C (its BL702) with Gowin's SRAM sequence (UG290: CONFIG_ENABLE, ERASE_SRAM
  and its MEMORY_ERASE waited for, XFER_DONE, INIT_ADDR, XFER_WRITE of the .fs's bytes, CONFIG_DISABLE, DONE in the status).
  The chain knows the Artix-7s' and the GW1NR-9C's IDCODEs. core/usb-program.js picks the driver by the board's webusb
  (core/boards.js) and the file, and checks a .fs's IDCODE as the server does; web/js/api-local.js uses it for Program and
  Initialize Chain, and its build drops a stale .fs and gives its size. The ULX3S stays the local server's (its FT231X:
  next). Tests: test/ftdi-jtag.test.js and test/usb-program.test.js against test/fixtures/ftdi-jtag-sim.js (an MPSSE, a
  TAP, an Artix-7 and a GW1NR-9C written from AN_108, UG470 and UG290), adept (unchanged), UI standalone-program (the site
  built: the Tang Nano 9K's .fs made in the browser then loaded, the Basys 3 scanned and loaded, the ULX3S refused; both
  interfaces, Portuguese). Proven with stand-ins only: not yet on a real Basys 3, Nexys A7 or Tang Nano 9K.
