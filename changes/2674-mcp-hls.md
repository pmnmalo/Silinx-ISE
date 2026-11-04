In short:

- An AI assistant (MCP) runs a C or C++ source's C Simulation and its C/RTL Co-simulation, reads its C Synthesis Report,
  and reads the HDL and the ASM chart Silinx HLS makes of it, as the C module's processes do.

In detail:

- **MCP: Silinx HLS (#2674):** `c_simulation` runs a C source's main() (core/c-interp.js: its output, what main()
  returned, its calls of the top function), `c_cosimulation` replays them on the HDL made from it in VHDL or Verilog
  (core/c-cosim.js: PASS or FAIL with each mismatch, the latency), `c_synthesis_report` says what it is made into
  (core/c-report.js) and `c_generated` gives the HDL or the ASM chart made of it; scheduled for the board's clock,
  the device's delays and the project's RTL blackboxes, as in the interface, with its messages. In
  `server/mcp-hls.js`. Test: test/mcp-hls.test.js (the test designs fir, gcd, sort, popcount and stream_sum).
