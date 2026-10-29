In short:

- In the schematic editor, MUX and DEMUX wider than a bit have "Pins per bit", which draws one of them for each bit,
  their select and enable shared, joined as BUFE4's enable.

In detail:

- **MUX and DEMUX with a pin per bit (#2081):** core/schdoc-symbols.js gives the multiplexers and the demultiplexer Pins
  per bit: with it a W-bit one is W of them one under the other, a MUX's row r with D<i>_<r> and O<r>, a DEMUX's with
  D<r> and O<i>_<r>; the select bits and the enable are one pin each, shared. web/js/sch-svg.js draws a body a row, the
  select lines through them from their pins and the enable's line on the left with a dot at each row; each row's pins
  named as the one-bit one's. core/schdoc-hdl-cases.js writes each row's assignments, the shared pins read (and an
  unconnected one tied to 0) once; the ISE export names them xl_mux…_bits / xl_demux…_bits, imported back with the
  option. Tests: test/mux-bits.test.js (the HDL simulated in VHDL and Verilog), test/ui/sch-mux-bits.test.js (both
  interfaces, Portuguese), test/ui/sch-bits-enabled.test.js; the schematic corpus re-saved with the new parameter.
