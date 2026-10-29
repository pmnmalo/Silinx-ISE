In short:

- In the schematic editor, INV and BUF wider than a bit have "Pins per bit" in their properties, as BUFE / BUFT:
  I0, I1… and O0, O1…, one triangle each, as the Xilinx INV4.

In detail:

- **INV and BUF with a pin per bit (#2067):** core/schdoc-symbols.js gives INV and BUF the Pins per bit parameter: with
  it, a W-bit one has I0..I(W-1) and O0..O(W-1), a row each (80 x 20W); web/js/sch-svg.js draws a triangle a row (the
  type under them); core/schdoc-hdl-symbol.js writes an assignment a bit; the ISE export names it xl_inv_w<W>_bits /
  xl_buf_w<W>_bits, imported back with the option. Tests: test/inv-bits.test.js (the HDL simulated in VHDL and
  Verilog), test/ui/sch-inv-bits.test.js (both interfaces, Portuguese). The gates example and the schematic corpus
  re-saved with the new parameter.
