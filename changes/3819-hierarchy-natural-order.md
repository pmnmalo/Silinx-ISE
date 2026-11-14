In short:

- **The Design pane lists the modules and the instances by their names, in natural order.** access_next_state_2 now
  comes before access_next_state_10 in the Implementation and the Simulation view, Simulate's test bench choice and the
  module pickers; a module's instances are listed by their names too, no longer in their source's order.

In detail:

- **The hierarchy's names in natural order (#3819).** The Design pane's roots (the Implementation view's top first, the
  Simulation view's), Simulate's choice of the test bench, Set Top Module…, the design link's module list, Verify
  Equivalence's reference, a schematic's module palette and its instance's Module list sorted the names as text
  (x_1, x_10, x_2): they now compare the numbers in a name by their value (x_1, x_2, x_10), the rest case-insensitively
  as before, through one comparator (core/hier-order.js). A module's instances, listed in their source's order, are
  sorted by their names the same way (then by their modules'). The MCP's project_info gives the roots of both views in
  the same order (`hierarchy`).
