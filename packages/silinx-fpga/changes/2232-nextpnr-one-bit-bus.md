In detail:

- **The nextpnr engine: x<0> on a one-bit bus port only, not on a scalar (#2232):** `nextpnrNetlist`
  (src/open-flow-nextpnr.js) looked every one-bit port up as `x<0>` too, a `std_logic` one included, which ngdbuild
  does not find. Now only a port Yosys marks `single_bit_vector` (`std_logic_vector(0 downto 0)`, `[0:0]`) takes it, as
  Silinx's packer does since #2229. Test: test/nextpnr-engine.test.js.
