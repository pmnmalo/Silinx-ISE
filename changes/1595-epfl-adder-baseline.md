In detail:

- **The design corpus's epfl-adder: its carry-select netlist recorded (#1595):** #1361's carry-select segments make
  the 128-bit adder 20 % faster after routing (12.98 -> 10.33 ns) for 20 % more slices (194 -> 232, 171 -> 464
  LUTs), the trade #1361 accepted; its expectations were not recorded, and the nightly reported the size as a
  regression.
