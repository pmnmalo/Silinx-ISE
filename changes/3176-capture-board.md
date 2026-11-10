In short:

- **A capture on the board:** the MCP tool `capture` arms the logic analyzer over the JTAG cable of a Basys2 or Nexys2,
  waits for its trigger, reads the samples and saves them in `build/capture.json`.

In detail:

- **The logic analyzer's link to the board (#3176):** `core/ila-link.js runCapture` runs a capture through the core's
  JTAG user register. It arms, checks that the board's core is the capture's (its status word's shape), polls the
  status until the capture is complete (the core's flags cross only during a scan, so a poll can read them stale), then
  reads the samples out. A timeout says why: not armed (no clock), or no trigger yet, in which case `arm: false` waits
  again. The link is the board's USER1 instruction and a scan of the register, with the PROM of the chain in BYPASS.
  In the browser it is the Digilent Adept USB over WebUSB (`adeptLink`, `core/adept.js`: a whole readout in a few USB
  commands). On the server it is adepttool (`scripts/ila-scan.py`, kept open for the run; `server/ila-board.js`). The
  MCP tool `capture` rebuilds the core's spec from the project's capture settings as Implement does, and saves each
  probe's samples by its path in `build/capture.json`. Tested against the core's own HDL simulated in VHDL and Verilog
  (the commands the protocol sends, the readout the model's window), a simulated Basys2 and Nexys2 over WebUSB, and
  the real script with stand-ins for adepttool.
