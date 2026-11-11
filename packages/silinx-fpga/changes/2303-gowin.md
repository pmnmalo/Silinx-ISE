In short:
- The Gowin: a design goes from HDL to its routed design with Yosys's `synth_gowin` and nextpnr-himbaechel-gowin, with its pins in a CST; no bitstream yet.

In detail:
- The third family of YoWASP's tools (#2303): `open-flow-gowin.js` (its steps: synth, translate, par into nextpnr's routed netlist; `GOWIN_DEVICES`, the device and family nextpnr is given for a part, a package and a speed; a port with no pin an error before nextpnr; `GOWIN_NO_BITSTREAM`, why there is no bitgen step), `cst.js` (the CST as a format of the constraints' model: IO_LOC, IO_PORT, a clock's period as a `create_clock` comment), `io.nextpnr.gowin` (`gowinIo`, `nextpnrGowinNode`) from YoWASP's `@yowasp/nextpnr-himbaechel-gowin`, an optional peer dependency; the family in `FAMILY_INFO` and the resources model; a board's constraints written as a CST, each pin's I/O standard the board's.
