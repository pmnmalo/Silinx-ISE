In short:

- In the schematic editor, a flip-flop (FD, FT, FJK and their variants) has "Inverted output QN (/Q)" in its
  properties: a second output /Q, not Q, below Q.

In detail:

- **Flip-flops with an inverted output QN (#2161):** core/schdoc-symbols.js gives the flip-flops the parameter qn (off by
  default: the symbols and their HDL as before); with it a pin QN, level with the last input, which web/js/sch-svg.js
  names Q barred; core/schdoc-hdl-symbol.js drives it as not Q (VHDL through the local copy of Q; Q left open: Q kept in
  a register of its own), so that Try it shows it; the ISE export names it xl_<type>_i<INIT>[_w<W>]_qn (no library
  flip-flop has QN), imported back with the option. Tests: test/ff-qn.test.js (every flip-flop simulated in VHDL and
  Verilog, QN against Q at every clock, no warnings), test/ui/sch-ff-qn.test.js (both interfaces, Portuguese, Try it).
