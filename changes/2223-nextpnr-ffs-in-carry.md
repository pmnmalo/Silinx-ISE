In short:

- **The nextpnr engine takes fewer slices:** the examples through nextpnr are now at or below Silinx's own size on nearly
  every build (the VGA example 148 slices, where it took 157 and Silinx takes 150 to 153).

In detail:

- **The nextpnr engine: flip-flops alone in the carry chains' slices, a carry in at 1 from the VCC site (#2223):**
  nextpnr-spartan v0.10.0 puts a flip-flop alone into a free flip-flop place of a chain's slices when BX / BY is free or
  carries the same net and the control set suits, as Silinx's packer does. A chain's carry in at 1 comes from the CLB's VCC
  site instead of a LUT giving 1, and a stage whose select is a constant reads a LUT giving it instead of passing a constant
  LUT through. The router is kept off the paths that would break such a slice (the flip-flop's D only through BX / BY).
