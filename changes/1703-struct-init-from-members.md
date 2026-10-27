In detail:

- **Struct initializers (#1703):** a struct initialized from another struct's members (`S v = {w.a, w.b};`, nested
  lists, an array of structs) is accepted: the values' own struct uses are rewritten into their members' variables
  (they were left as written, refused as "'w' is not declared").
