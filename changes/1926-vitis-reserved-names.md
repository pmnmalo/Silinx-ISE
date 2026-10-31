In short:

- **Silinx HLS's port names as Vitis HLS's:** an argument named `neg` keeps its name; `read`, `write`, `value`,
  `length`, `rst` and the block protocol's names (`ap_start`…) are named `<name>_r`, as Vitis HLS names them.

In detail:

- **Vitis HLS's reserved names, checked against Vitis HLS 2025.2 (#1926):** `scripts/hls-vitis-names.mjs` runs 444
  candidate names (SystemC's, C++'s keywords, the block protocol's, every word of VHDL, Verilog and SystemVerilog) as
  the arguments of small tops through Vitis's C synthesis and records each port's name
  (`test/hls-corpus/vitis-names.json`); `core/c-names.js` renames exactly those, in any letter case. `neg` is no longer
  renamed (#1902 had guessed it); VHDL-2008's PSL words and SystemVerilog-2009's, which Vitis keeps, are kept; `units`,
  `uwire`, `include`, `incdir` and `rtranif1`, which Vitis keeps but Silinx's HDL would not compile with, stay renamed,
  their warning saying so.
