In detail:

- **silinx-fpga's command line (#1679):** step 8 of the toolchain's separation (#1651, docs/TOOLCHAIN-SEPARATION.md).
  `silinx-fpga build <file.v ...|netlist.json> --part xc3s250e-cp132-4 [--ucf pins.ucf] [-o top.bit]` (the package's
  `bin`, packages/silinx-fpga/bin/silinx-fpga.js, src/cli.js) runs the toolchain's flow (runFlow) from Verilog or
  a Yosys JSON netlist to the .bit. Options: the top (found when not given), the out folder (the netlist, the placed
  and routed XDL, the timing report), the effort, the placer's seed, no register replication, quiet. The Verilog is
  checked by Yosys first, file by file, so an error says its file and line. It prints the flow's log, warnings and
  errors on stderr, and exits 0 when built, 1 when the flow fails, 2 on a wrong command line. Spartan-3E parts with
  a device description and a bit database (the Basys2's and the Nexys2's); VHDL needs Silinx ISE. The package's
  README builds a blinky for the Basys2 with it. Tests: test/silinx-fpga-cli.test.js (the options and their errors,
  the parts, the top, the design's errors, the README's blinky with no warnings and its .bit byte for byte the IDE
  flow's, from its Verilog and from its netlist).
