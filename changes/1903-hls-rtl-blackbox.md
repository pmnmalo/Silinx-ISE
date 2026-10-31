In short:

- Silinx HLS takes Vitis HLS's RTL blackbox (`syn.blackbox`): a JSON file describes a function written in VHDL or
  Verilog; the C simulation runs its C model, the synthesis instantiates the module in place of each call, and the
  co-simulation replays the calls on the module itself.

In detail:

- **Silinx HLS: the RTL blackbox (#1903):** core/c-blackbox.js reads the descriptions (Vitis HLS's keys: the function,
  the module, its C model and RTL files, each argument's ports, the result, the clock, reset, enable and the
  ap_ctrl_chain signals, the latency) and refuses a malformed one with a message that starts with `syn.blackbox:`;
  memory and stream ports, and a blackbox in a DATAFLOW region, are refused as not supported yet. The C simulation
  adds the C model to the unit (core/c-interp.js); the synthesis checks the function's arguments and the module's
  ports, then makes each call a state of the machine (core/c-fsmd.js): its inputs in registers, `ap_start` pulsed,
  the state waiting for `ap_done` or the latency, each output taken on its valid; the module is instantiated in the
  VHDL and the Verilog (core/c-hdl.js), and the ASM chart draws its state. The co-simulation (core/c-cosim.js)
  simulates the module's files with the HDL. In the app, the server's ISE flow and the browser's open flow, the
  project's descriptions are read with the files they name (`blackboxesIn`). The corpus's misc-rtl-as-blackbox
  now passes the C simulation, the synthesis and the co-simulation; its manifest names its description and files
  (scripts/hls-corpus-manifest.mjs, also for the Vitis HLS run). Tests: test/c-blackbox.test.js,
  test/hls-corpus.test.js, test/ui/c-source.test.js.
