In short:

- The Silinx toolchain packs the Spartan-3E's slices more densely (nextpnr 1.5.1): the vga example one slice smaller.

In detail:

- **The Spartan-3E's nextpnr engine at 1.5.1 (#3389, part of #2819 and #2982):** nextpnr-spartan PR 36 packs the slices as
  densely as Silinx's own packer: a flip-flop set and one reset by the same net share a slice (only the set / reset's
  synchrony is the slice's), the flip-flops alone go into the wide multiplexers' slices too, an XORCY of a constant LI
  joins its carry stage and the stages that are wires (a select at 0, an LI at 0) are left out, and each LUT goes with the
  first flip-flop it feeds. The open synthesis counts a netlist's slices by the same rules
  (`packages/silinx-fpga/src/slice-estimate.js`).
