In short:

- **Karnaugh maps: the variables' order selectable:** beside the map, *MSB → LSB by columns, then rows* (now the
  default: for 4 inputs a b on the columns, c d on the rows) or *MSB → LSB by rows, then columns* (the layout until
  now); saved with the table.

In detail:

- **The Karnaugh maps' order of the variables (#2924):** `kmapLayout(n, order)` (core/logic.js, `KMAP_ORDERS`) lays
  the variables out MSB → LSB by columns then rows (`cols`, the default) or by rows then columns (`rows`); the map's
  shape is the same in both. With 5 and 6 inputs the most significant pick the map (a; a b) in both orders, and the
  order lays the other four out on each map. The groups, the cells' minterms, the 3D maps, the print view follow it.
  The Boolean Algebra editor's *Order:* selector beside the map (both interfaces, Portuguese) saves it in the table
  as `"kmapOrder": "rows"` (the default not written); through the MCP server, write_file of the table with it.
