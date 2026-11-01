In detail:

- **MCP server: the place and route summary without "null passes" (#2420):** `get_report`'s summary of a Silinx
  toolchain run said "null passes" with the nextpnr engine, which counts no router passes; it now gives the passes
  only when the engine counts them.
  - **Tests:** test/mcp.test.js.
