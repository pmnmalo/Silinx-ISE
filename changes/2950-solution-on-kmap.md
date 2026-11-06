In short:

- **Boolean algebra: the minimal solution chosen on the Karnaugh map is the one used:** when a function has several
  minimal SOPs or POSs, the selector is in the map's section, and the solution chosen goes into the results, the
  NAND / NOR forms, the module's HDL and its schematic.

In detail:

- **The minimal solution chosen, on the Karnaugh map, used everywhere (#2950):** the selector of the minimal solutions
  (#2928) moves from the results to the Karnaugh map's options, for the groups the map shows; the results say "Solution
  k of N". The choice is saved in the table (`solutions`: per output, SOP and POS) and used by its HDL module (its
  comment says the solution), its schematic, its NAND / NOR forms and the least gates / delay; a cell or an expression
  changed goes back to the first; Undo. The MCP's `related_view` results mark the solution used; `set_output_logic`
  chooses it.
