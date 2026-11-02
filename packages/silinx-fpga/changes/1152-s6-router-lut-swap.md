In detail:

- **The Spartan-6 router swaps a LUT's inputs (#1152):** `routeS6(design, device, { swapLutPins })` (default on, as the
  Spartan-3E router's): a net may end on any pin of its LUT position (A1 … A6) no other net takes, the one its path
  reaches best (`s6/route-swap.js`: not a RAM or shift register, not A6 under an O5, not the pins of clocks, power or
  unrouted nets); `routedXdlS6` rewrites the position's O6 and O5 equations for the pins taken. The examples take 10
  to 14 % fewer PIPs (1.00 to 1.08 times ISE's per connection, 1.10 to 1.22 before; `research/s6/compare-route.mjs
  --silinx`, `measured/route-compare.json`), every LUT the same function of its nets. Test: test/s6-route.test.js.
