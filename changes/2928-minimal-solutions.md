In short:

- **Every minimal solution:** when a function has several minimal SOPs or POSs, the Boolean Algebra editor browses
  them ("Solution 2 of 5", previous / next): each one's expression, cost, circuit and groups on the Karnaugh map,
  flat or 3D. The module's HDL, its schematic and the NAND / NOR forms keep the first.

In detail:

- **Boolean algebra: every minimal solution viewable (#2928):** `minimize` (core/logic.js) returns every minimal
  solution it found (up to 64) in `alternatives`, in a stable order, the first the one used so far; `analyzeOutput`
  gives each its expression and gates. The editor's minimal SOP and POS with several have a selector beside their
  note ("N minimal solutions exist."; "Many …: the first 64 can be browsed" at the cap); the choice sets the
  expression, cost, circuit and the map's groups (flat and 3D), is printed as shown, and goes back to the first when
  the table changes. The MCP server's `related_view` results list every minimal solution (#2674). In Portuguese; unit tests on cyclic covers against a brute-force enumeration, UI tests in both
  interfaces.
