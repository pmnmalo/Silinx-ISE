In short:

- An AI assistant (MCP) makes a clock manager (a DCM on the Spartan-3E, a PLL on the Spartan-6) and a block memory
  (a RAM or a ROM, from a .mem or .coe file) as the Clocking Wizard and the Block Memory wizard do, and makes one of
  theirs again with other settings.

In detail:

- **MCP: the Clocking Wizard and the Block Memory wizard (#2674):** `clock_manager` makes a DCM_SP or a PLL_BASE
  module for the frequencies asked (core/clocking.js: each output at the nearest frequency it can, said when it is
  not the one asked), `block_memory` a RAM or a ROM of the device's block RAMs (core/blockram.js: one port or two,
  its write mode, the primitives or inferable HDL, its initial contents from a .mem or .coe file), in VHDL or
  Verilog; `edit` makes a module of theirs again from the settings in its header with those given changed, as
  editing it reopens the wizard. The wizards' checks and messages (the device's family and its DCMs, PLLs and block
  RAMs, a memory larger than the device, the ports' names). In `server/mcp-wizards.js`. Test:
  test/mcp-wizards.test.js (the modules compiled in both languages and simulated: the ROMs read back their .mem
  file, the DCMs lock and make their 100 MHz). A wrong warning of their Check Syntax found on the way: #2716.
