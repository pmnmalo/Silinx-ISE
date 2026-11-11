In detail:

- **gateAssignments counts the gates of an expression with a stack of its own (#3375):** an expression of thousands of
  operators (a + b + c …, its left operands nesting as deep) no longer overflows the stack when a design's 1-bit gates
  are counted (the carry chains' recovery).
