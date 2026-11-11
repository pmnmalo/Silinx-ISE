In detail:

- **gateAssignments with a stack of its own (#2577):** the walk that counts a design's 1-bit gates (the carry chains'
  recovery) no longer recurses once per level of the bound tree, which an if … elsif chain of thousands of branches
  nests as deep: such a design's synthesis input is made again.
