In detail:

- **The 7-series' occupied slices: an empty half of a CLB tile no longer counted (#3683).** `xc7FasmUtilization` counted
  every slice with a FASM feature, and nextpnr's FASM writer (fasm.cc, `write_logic`) writes both halves of every logic
  tile it uses: an empty half gets the FF block's default bit, `NOCLKINV`, alone. So the "Number of occupied Slices" was
  twice the CLB tiles used, 10-20 % of them empty. A slice now counts only with a feature other than `NOCLKINV` (a LUT, a
  flip-flop, a mux, a carry, a used routing mux of the site).
  - **Measured** (the examples on the Basys 3, router2, seed 1): gates 2 -> 1, traffic 66 -> 50, blinky 88 -> 73, pong
    152 -> 136, stopwatch 144 -> 122, clock 112 -> 101, vga 80 -> 66, isqrt 54 -> 47, uart 80 -> 70, micro80 110 -> 91.
  - **Tests:** test/open-flow-xc7.test.js (a tile's used half and its empty half: one slice; a half with only a flip-flop,
    a carry, an output mux, a feed-through or an inverted clock counted; the reference FASM of blinky 93 -> 77 slices).
