In detail:

- **The package, and its first modules (#1710):** silinx-hdl, the HDL front end, as an npm workspace of Silinx's
  repository (private until it is published, #1711; its own version, 0.1.0; Apache-2.0). The VHDL parser (src/vhdl/),
  the Verilog parser (src/verilog/), src/util.js and the UNISIM primitives' models (src/unisim.js, unisim-s6.js,
  unisim-jtag.js) move into it from Silinx's core/ as they are; no behaviour change.
