In detail:

- **Calls nested more than 32 levels deep (#3508):** the elaboration refuses a call past `MAX_CALL_NESTING` (32,
  src/util.js) subprograms being bound one inside another with one error, "calls nested more than 32 levels deep (a
  function calling another, that calls another…)", at that call, in its file; a constant computed through thousands of
  chained functions overflowed the stack.
