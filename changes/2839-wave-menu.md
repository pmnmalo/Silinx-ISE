In short:

- **The simulator's ⋮ menu:** Save and Load Wave Configuration move from the simulator's toolbar into a ⋮ menu at its
  right end, in both interfaces; the menu works from the keyboard. An AI assistant saves and loads wave configurations
  too (the MCP server's `save_wave_config` and `load_wave_config`).

In detail:

- **The waveform viewer's ⋮ menu (#2839):** the simulator's toolbar ends with the documents' ⋮ menu
  (`web/js/toolbar-menu.js`), at the right of its first line, its place kept free whatever wraps (in the Tasks
  interface after the Model field); Save Wave Configuration… and Load Wave Configuration… are its entries, with their
  tooltips and Portuguese labels, and their two buttons leave the toolbar. The shared menu now works from the keyboard,
  in every document that has it: Enter or Space on ⋮ opens it on its first entry (↓ and ↑ too), ↑ / ↓ / Home / End move
  through its entries, Esc closes it back on ⋮; it is a `menu` for screen readers. A configuration's rows from and onto
  a design's signals are `core/wcfg.js`'s (`wcfgSignal`, `placeWcfg`), shared by the wave window and the MCP.
  - **MCP (#2674):** `save_wave_config` writes a .wcfg of the simulation (the test bench's signals by default, or the
    rows given: signals with their radix, dividers, groups; the markers) next to its source, replacing a file only with
    `overwrite`; `load_wave_config` reads one onto the design, its signals as `simulate` takes them, a signal the design
    has not said and left out, with the interface's messages.
  - **Tests:** test/ui/sim-wcfg.test.js (Silinx, ISE style and Tasks, in Portuguese: no Save / Load on the toolbar, ⋮
    at its right end, the menu by the mouse and the keyboard, Save and Load as before, the status line unchanged, no
    warnings), test/ui/isim-parts.test.js, test/mcp-wcfg.test.js, test/wcfg.test.js (`wcfgSignal`, `placeWcfg` on a VHDL
    and a Verilog design).
