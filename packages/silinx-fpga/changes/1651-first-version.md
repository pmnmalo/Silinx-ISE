In short:

- **silinx-fpga:** the Silinx toolchain as a package of its own, for the Spartan-3E (Basys2, Nexys2) and the
  Spartan-6 (Nexys3, Atlys): synthesis with Yosys in WebAssembly from flat Verilog or a Yosys netlist, then
  pack, place, route, timing and the bitstream, byte for byte the one ISE's bitgen writes, with the device
  graphs and the bit databases; a command line, `silinx-fpga`; nextpnr as a Place & Route engine behind a flag.

In detail:

- **The package (#1651):** the toolchain moved out of Silinx ISE into packages/silinx-fpga
  (docs/TOOLCHAIN-SEPARATION.md in the Silinx ISE repository): its modules and data (#1677), its API
  (src/index.js, src/parts.js, src/node.js, #1678), its command line (#1679), its tests and its research
  (#1680), its licence (Apache-2.0) and notices (#1681).
