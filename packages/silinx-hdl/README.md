# silinx-hdl

The Silinx HDL front end: the VHDL and Verilog parsers, the elaboration, the event-driven simulator with the UNISIM
primitives' models, and the elaborated design written as one flat Verilog module for synthesis (the input of
[silinx-fpga](../silinx-fpga), the toolchain). It reads VHDL and Verilog alike, with Xilinx XST's Spartan-3E
behaviour as the reference. It is being separated from Silinx, the IDE that uses it
([#1710](https://github.com/pmnmalo/Silinx/issues/1710), the plan:
[docs/TOOLCHAIN-SEPARATION.md](../../docs/TOOLCHAIN-SEPARATION.md), section 5). Its code is in `src/`: the parsers
(`src/vhdl/`, `src/verilog/`) and the UNISIM models (`src/unisim*.js`) so far; the elaboration, the simulator and
the flat Verilog move here next. The IDE's old paths in `core/` re-export what moved, until the package has its
API ([#1711](https://github.com/pmnmalo/Silinx/issues/1711)). Not published yet.

It imports nothing of the IDE and no npm package (`test/hdl-boundary.test.js`).

Licence: Apache-2.0 ([LICENSE](LICENSE)).
