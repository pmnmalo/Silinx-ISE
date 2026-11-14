In short:

- **VHDL: a generic's default that uses another generic of its entity is an error,** as in ISE: Check Syntax reports
  it at its line, where it passed before and then failed in ISE.

In detail:

- **VHDL: a default of an interface list that uses an earlier object of the same list refused (#3744).** VHDL-93 (LRM
  4.3.2.1) and XST do not allow it: a generic's default that uses an earlier generic of its entity or component, a
  port's that uses an earlier port, a subprogram parameter's that uses an earlier parameter. Check Syntax reports
  "Initializing expression of generic 'tick' is not valid in this context as it contains reference to other interface
  objects (LRM 4.3.2.1): it uses generic 'clk_hz' (line 3)." at the use; a package's constant, a selected name and a
  generic in a port's default stay accepted. The Design pane's VHDL translation of a Verilog module writes such a
  parameter's default with the earlier parameter's default in its place (`D : integer := 8 * 2`, not `W * 2`).
