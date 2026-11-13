In short:

- **Design and simulation only:** New Project offers a project with no FPGA (Project Kind: "Design and simulation only
  (no FPGA)"): no board and no device to choose, its sources drawings (schematic, state diagram, ASM chart, Boolean
  algebra, Petri net), checked and simulated, with no HDL shown and no implementation, emulation or programming. A
  board chosen in Design Properties makes it an FPGA project, its HDL and its flow shown; the reverse too, when every
  source is a drawing.

In detail:

- **A design and simulation project in the interface (#3780, part 2):** New Project's Project Kind (its Project
  Settings page then the Top-Level Source Type alone, a drawing); Design Properties' board list with "Design and
  simulation only (no FPGA)" first, both ways (the reverse refused in the console while the project has HDL or C
  sources of its own). In such a project the Design pane has no `[VHDL]` / `[Verilog]` badges and its row is "Design",
  the Files tabs list no HDL, an HDL file opened is its drawing, an HDL file added or imported is refused with the MCP
  server's message, New Source offers the drawings and the labs with no language, the Test Bench Wizard writes no
  skeleton and simulates the bench it makes, Source Properties, the schematic's Properties, the state diagram's Coding
  Style and the truth table's HDL notations ask no language, and Check Syntax is Check Design; the process tree, the
  tasks (Design and Simulate), the menus and both toolbars have no Design Summary, implementation, emulation, pin
  planning or programming (`web/js/design-only.js`, `web/js/project-kind-ui.js`, the `DESIGN_ONLY` descriptor).
