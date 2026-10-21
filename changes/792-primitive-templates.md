In short:

- **Device Primitives in the Language Templates:** the HDL editor's Templates ▾ (and its context menu) has an
  instantiation template of each primitive of the project's family, VHDL and Verilog, with how many the device has.

In detail:

- **The Language Templates' Device Primitives (#792):** a template per primitive of the schematic library's list
  (core/prim-templates.js reading core/primitives.js): its attributes at their defaults with their ranges, its pins
  with what they do, the inputs it works without tied, a comment with the primitive and its count on the project's
  part; its placeholders (the instance's name, the signals, a DCM's or a PLL's frequencies) inserted with the
  instance's name selected.
