In short:

- **Silinx toolchain, Post-Translate and Post-Map Simulation Models:** *Generate Post-Translate / Post-Map
  Simulation Model* no longer need Xilinx ISE; *Simulate* and *Emulate Post-Translate / Post-Map Model* run
  the Silinx toolchain's own netlists, in VHDL or Verilog, as ISE's netgen writes them.

In detail:

- **Post-Translate and Post-Map Simulation Models of the Silinx toolchain (#121):** `build/netgen/translate/<top>_translate.vhd`
  and `build/netgen/map/<top>_map.vhd` (and `.v`), of SIMPRIM primitives with the top's ports: the netlist of
  the synthesis as ngdbuild translates it (a MUXCY an X_MUX2, an FDRE an X_SFF…), and the packed design with
  each slice as the elements its configuration uses (LUTs, F5 / FX multiplexers, the carry chain, flip-flops or
  latches with their clock, enable and set / reset inverters), the pads, the global clock buffers, block RAMs,
  multipliers, shift registers, distributed RAMs and DCMs. Synthesized with the generics the test bench gives
  the design, as the post-synthesis model (once for the three models). A LUT's input its equation does not read
  is tied to 0 (the packer wires the carry's data input to such a pin; connected, an unknown value there kept
  vga's model unknown). Every example's test bench passes on both models in both languages, and both models of
  the packer's fixtures and of small designs with shift registers, RAMs, block RAMs, multipliers and latches
  match the netlist's cycle simulator. A Verilog netlist of SIMPRIM primitives now gets Silinx's SIMPRIM models.
