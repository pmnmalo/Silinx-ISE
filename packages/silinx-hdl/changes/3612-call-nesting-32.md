In detail:

- **Calls nested at most 32 levels deep (#3612):** `MAX_CALL_NESTING` 64 → 32 (#3508's limit, not released): each
  level of a chain of calls in an if, a for and a case takes about 10 KB of the elaboration's stack, and 64 of them
  overflowed Node's default stack on CI's macOS runner (Node 22) in every run; 32 bind and simulate there in every run,
  still with 800 KB.
