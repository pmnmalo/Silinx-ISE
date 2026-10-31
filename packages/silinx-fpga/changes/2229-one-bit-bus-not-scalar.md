In detail:

- **The packer: x<0> on a one-bit bus port only, not on a scalar (#2229):** #2199 applied a UCF name `x<0>`, `x(0)` or
  `x[0]` to any one-bit port `x`, a `std_logic` one too, which ngdbuild does not find (the #84 test failed). Now only a
  port declared `std_logic_vector(0 downto 0)` / `[0:0]` takes it: `readYosysJson` (src/fpga/netlist.js) marks it
  `oneBitBus` from Yosys's `single_bit_vector` attribute, and `portAssignments` (src/ucf.js) takes their names
  (`oneBitBuses`, from `oneBitBusesOf` in src/fpga/pack.js, for the Spartan-3E packer and src/fpga/s6/phys.js). Tests:
  test/ucf.test.js, test/iob-pack.test.js, packages/silinx-fpga/test/fpga-hard.test.js (#84).
