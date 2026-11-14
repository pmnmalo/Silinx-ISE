In detail:

- **A default of an interface list that uses an earlier object of the same list (#3744):** the VHDL parser reports it
  as an error at the use (src/vhdl/interface-refs.js), in a generic list (an entity's, a component's), a port list and
  a subprogram's parameter list, as VHDL-93 (LRM 4.3.2.1) and XST do: "Initializing expression of generic 'tick' is not
  valid in this context as it contains reference to other interface objects (LRM 4.3.2.1): it uses generic 'clk_hz'
  (line 3)." A package's constant, a selected name and a generic in a port's default stay accepted.
