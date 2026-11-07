In short:

- **Silinx HLS's RTL blackbox in a DATAFLOW region:** a function replaced by a hand-written module may be called in
  a `#pragma HLS DATAFLOW` region: a process of its own, its streams and arrays the region's channels.

In detail:

- **An RTL blackbox in a DATAFLOW region (#2340):** its call is a process of its own (core/c-blackbox-process.js): a
  module made for it, `<function>_bb`, with a process's ports (the block protocol; a stream's `_dout` `_empty_n`
  `_read` or `_din` `_full_n` `_write`; a memory's `_address0` `_ce0` `_we0` `_d0` `_q0`; an input), the RTL module
  inside it, started once a call by the region's handshake (ap_start taken when it is idle), done with its ap_done or
  its latency, its ap_ce and ap_continue held at 1. Its channels: the region's streams and buffers, the top's streams
  and arrays, an input of the top's or a constant; an output or a result refused, as Vitis HLS refuses an output
  pointer there. A process of C that calls a blackbox (a loop of the region's) sees the project's blackboxes too. The
  C Synthesis Report names the process's RTL module and its latency ("ended by its ap_done" when the description
  gives none). Tests: two blackbox processes and a stream, of a Verilog and of a VHDL module; a process of C and a
  blackbox's with an input of the top's; a buffer a process of C writes, read through the blackbox's memory port;
  the top's array; co-simulated in VHDL and in Verilog, read by Check Syntax's design checks (#2992's messages, of any
  region, asserted); a module that differs mismatches; the refusals; the MCP's `c_simulation`, `c_cosimulation` and
  `c_synthesis_report`; the UI test in both interfaces.
