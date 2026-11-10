In detail:

- **The logic analyzer's capture core (#3176, the first part):** `core/ila.js` generates a capture core in VHDL or Verilog,
  as ChipScope's / Vivado's ILA. It samples the probes on the design's clock into a block RAM (an inferred array,
  written on the capture clock and read on the JTAG clock). It keeps `pre` samples before the trigger, which is
  conditions on the probes (= / != a value; a rising or falling edge; a change) combined by and / or. The PC arms the
  core and reads it through a JTAG user register (a BSCAN's DRCK, SEL, CAPTURE, SHIFT, TDI, TDO). The register's
  commands are status, arm, read the next sample and rewind, and the status word tells whether the capture is complete
  and gives the core's shape. `core/ila-capture.js` is the PC's side: the scans to send, the status read back, a
  readout read into each probe's samples, and a capture replayed as a module whose simulated waves are its samples.
  Not in the interface yet: the core's insertion at Implement, the board's scans and the interface come in the next parts.
