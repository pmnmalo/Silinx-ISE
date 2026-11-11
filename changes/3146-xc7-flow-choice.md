In short:

- **The Basys 3 without Vivado (experimental):** Design Properties offers two synthesis tools for an Artix-7 project, AMD
  Vivado (the default) and Silinx (no Vivado needed; on trial); with Silinx, Synthesize, Implement Design and
  Generate Programming File run the Silinx toolchain's 7-series flow (Yosys, nextpnr, the `.bit` from its FASM), and the
  Design Summary says the timing is nextpnr's estimate, optimistic against Vivado.

In detail:

- **The Artix-7's flow, the project's choice (#3146):** the project's synthesis tool picks it, as Silinx or XST picks
  the Spartan-3E's: `vivado` (AMD Vivado, #1649, the default of a new Artix-7 project and of one with none) or `silinx`
  (the toolchain's 7-series back end, on trial; an Artix-7 project saved before, its tool then locked at `silinx`, now runs it:
  choose Vivado in Design Properties to keep Vivado's flow). The local server (`startImplementation`) and the interface
  (`vivadoMode`, `toolOf`: the tool descriptor `SILINX_XC7`, its steps Yosys, Translate, Place & Route by nextpnr, the
  static timing and the programming file; no simulation models, no views, no Emulate) read it the same way; the browser
  edition has no 7-series flow yet. Design Properties and the New Project wizard list Vivado and Silinx for the Artix-7
  (`devicePicker`'s `lockSynth`), in Portuguese too. The Design Summary: the timing's caption says nextpnr's estimate, the
  reports list the routed design's FASM. The MCP server does the same (#2674): `set_design_properties`' `synth_tool`
  takes `vivado` (the Artix-7's only; its default there, the project's choice kept within the family, Silinx again on
  another family) and `run_process` runs the project's.
