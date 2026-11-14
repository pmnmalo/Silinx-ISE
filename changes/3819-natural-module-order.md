In short:

- **Design pane:** modules are listed by the numbers in their names' value: `access_next_state_2` before
  `access_next_state_10`.

In detail:

- **The modules and files in their names' natural order (#3819):** one comparator, `core/natural-order.js`
  (`naturalCompare`, `firstThenNatural`: the numbers by their value, upper and lower case alike, the same in every
  browser and in Node), wherever the names are listed: the Design pane's modules in the Implementation and Simulation
  views (the top first), its other files, the Files page, Set Top Module's and Simulate's module and test bench
  choices, the simulator's test benches, the schematic's symbol palette, and the MCP's `project_info` (its other files,
  a design project's files). test/natural-order.test.js, test/ui/hierarchy-order.test.js (both interfaces).
