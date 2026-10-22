In short:

- **Simulator: Save and Load Wave Configuration:** the simulator's toolbar saves the wave window's signals (their order
  and radix), dividers, groups and markers as a file of the project (.wcfg, as ISim's) and loads one back into the
  current simulation; Save VCD is no longer in the toolbar.

In detail:

- **The simulator's wave configuration as a file (#1019):** Save Wave Configuration and Load Wave Configuration in the
  simulator's toolbar, in every interface (web/js/isim-wcfg.js; web/js/sim-wcfg.js: the file next to the simulated
  module's source by default, an existing one replaced when confirmed, the project's .wcfg files offered when loading,
  the module's own first); the file is ISim's .wcfg XML (core/wcfg.js: written and read, a file written by ISim read
  too); a signal the design does not have is said in the simulator's console and left out. The toolbar's VCD export
  is removed (the command line's `sim --vcd` stays).
