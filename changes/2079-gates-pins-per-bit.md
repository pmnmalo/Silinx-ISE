In short:

- In the schematic editor, the logic gates (AND, OR, XOR and their inverted kinds) wider than a bit have "Pins per bit",
  which draws one gate for each bit, as INV4 and BUFE4.

In detail:

- **The logic gates with a pin per bit (#2079):** core/schdoc-symbols.js gives every gate Pins per bit: with it a W-bit
  gate is W gates one under the other, gate k's inputs I0_k, I1_k… (inverted as the 1-bit gate's) and its output Ok;
  web/js/sch-svg.js draws a gate a row (the type under them); core/schdoc-hdl-symbol.js writes a gate's assignment a
  bit; the ISE export names it xl_<gate>_w<W>_bits, imported back with the option. The gates example and the schematic
  corpus re-saved with the new parameter. Tests: test/gate-bits.test.js (the HDL simulated in VHDL and Verilog),
  test/ui/sch-gate-bits.test.js, test/ui/sch-bits-enabled.test.js (both interfaces, Portuguese).
