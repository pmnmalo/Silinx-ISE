In detail:

- **The MCP server's simulate and run_process are bounded, and a cancelled request stops (#3408):** simulate
  (`server/mcp-hdl.js`) runs in chunks and stops at its time limit (`timeout_s`, 60 s by default, at most 600) and at
  20,000,000 time steps (as the C simulation), with its warning ("the simulation stopped at its time limit…") and its
  data's `limit`; the waves recorded and the delta cycles keep the interface's limits; `max_changes` is from 1 to 1000
  and the changes returned 100,000 in all. run_process (`server/mcp-processes.js`): `timeout_s` from 1 to 7200,
  `log_lines` from 1 to 1000. A request the client cancels (`notifications/cancelled`, `server/mcp.js`) stops its
  simulation or its process and is not answered, and the server answers the next request at once. Tests:
  mcp-sim-limits (each bound, its message and data; a cancelled simulation, the next request answered).
