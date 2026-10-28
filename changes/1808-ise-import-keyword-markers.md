In short:

- **ISE schematic import:** an I/O marker named as a keyword of the other language (`next`, `block` in a Verilog
  schematic) keeps its name, so the schematic's ports, HDL and UCF stay the module's.

In detail:

- **ISE schematic import: names checked against the schematic's language only (#1808):** the import renamed a
  marker, net or HDL block pin that was a keyword of VHDL or of Verilog, whichever the schematic's language; a
  Verilog schematic's `next` and `block` (secworks-aes, -sha1, -sha256) became `next_1` and `block_1`, its ports
  no longer the module's. A VHDL schematic still renames them, with a warning each.
