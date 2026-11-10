In short:

- **ISE's critical paths:** Xilinx ISE's Static Timing Report has the Paths panel too: trce's 20 slowest paths (the
  worst into each of 20 ends), each stage back to the HDL lines and the drawings it comes from, by XST's names.

In detail:

- **ISE's trce as a source of the paths (#3178):** the ISE flow runs trce with `-v 1 -n 20` (the worst path into each
  of 20 ends) instead of `-v 3 -n 3`; `core/twr-paths.js` reads its verbose report's paths stage by stage and finds
  each stage's source lines through XST's names (a register's, and the signal XST made a name from:
  `last_cmp_eq0000_wg_lut` → `last`, `state_reg_FSM_FFd3` → `state_reg`), `core/hdl-drivers.js` the processes and
  assignments that drive a signal of the design. The Paths panel opens beside `build/<top>.twr`, and the MCP server's
  `timing_paths` reads the last analysis's paths, the Silinx toolchain's or ISE's (the newer). On ISE 14.7's reports of
  blinky, traffic and pong every path's stages add up to its delay, the slowest is the minimum period, and every logic
  stage reaches a source line.
