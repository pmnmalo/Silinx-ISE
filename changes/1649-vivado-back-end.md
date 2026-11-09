In short:

- **AMD Vivado for the Artix-7 boards:** a project on the Basys 3 or the Nexys A7 is synthesized, implemented and
  made into a bitstream by AMD Vivado ML Standard 2025.2, in its Docker image, over ssh or on this computer, as Xilinx
  ISE is for the Spartan-3E: its processes in the Processes pane, its utilization, timing and design rule check in the
  Design Summary, its warnings in the console, the board programmed with openFPGALoader.

In detail:

- **Vivado as the Artix-7's back end (#1649):** `server/vivado.js` writes a batch Tcl flow in non-project mode
  (`synth_design`, `opt_design`, `place_design`, `route_design`, `write_bitstream`, each step's checkpoint, the
  reports), with ISE's step names so the Processes and the MCP server's processes run it unchanged; CFGBVS and
  CONFIG_VOLTAGE set unless the board's XDC sets them (no DRC CFGBVS-1). Toolchain Settings' `vivado` (its mode:
  docker, ssh or local; its image; its settings64.sh), its container with ISE's isolation and sysfs's buses, classes
  and devices hidden (Vivado's licence manager crashes without, #2305). `server/vivado-reports.js` parses
  report_utilization, report_route_status, report_timing_summary, report_drc, report_power and the log (each
  command's own messages) into the Design Summary's shape. The interface: the Artix-7's tool descriptor (VIVADO:
  Synthesize - Vivado, the implementation, the timing, the power, the pins, the programming file; no simulation
  model, no Emulate), a run without Vivado configured says so and writes the scripts; the browser edition keeps
  #3142's "no implementation flow yet". The MCP server's run_process (toolchain vivado) and get_report (Vivado's
  reports, a drc report). The other 7-series families keep ISE's flow.
- **The examples on the Basys 3 through Vivado (#1649):** `test/vivado/examples.test.js` (SILINX_VIVADO_TESTS=1, on
  the ISE machine): all ten routed, the 10 ns clock met, a .bit for the xc7a35t, the design rule check with no error;
  the warnings asserted: none, but synthesis's on traffic's and pong's outputs driven by a constant and on micro80's
  light8080 core's unread bits (#2544), and the design rule check's DSP pipelining advice on stopwatch.
- **MCP get_report's schema (#3158):** its `report` argument lists the reports (summary, power, timing, synthesis,
  map, par, pins, drc), not the toolchains.
