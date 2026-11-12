In short:

- **Silinx HLS: a global variable shared with a sub-module, a port of it:** a function with `INLINE off` that uses a
  global variable its caller uses too is now a module of its own, the variable one of its ports as Vitis HLS makes it,
  where it was inlined with a warning.

In detail:

- **Silinx HLS: a global shared with a sub-module its port (#2244):** a global variable an `INLINE off` function (or
  one kept by `large`) shares with its caller is an argument of the sub-module, the caller's variable passed at each
  call: an integer one a pointer's ports (`g_i`, `g_o`, `g_o_ap_vld`; `g` alone when it only reads it, `g` and
  `g_ap_vld` when it only writes it), an array a memory's, a struct's member each its own; the variable stays the
  top's (core/c-submodule.js `sharedGlobals`, core/c-hdl.js). One that a function the sub-module calls uses too stays
  inlined, said ("… is used by its caller too and by a function it calls"). Co-simulated in VHDL and Verilog with the
  exact warnings (test/c-global-ports.test.js), and through the MCP server's `c_synthesis_report`, `c_generated` and
  `c_cosimulation` (test/mcp-hls.test.js).
