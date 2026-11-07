In detail:

- **The MCP server and Xilinx ISE, said as they are (#3043):** `server/mcp.js`'s header and SECURITY.md say that
  `run_process` runs the Silinx toolchain, or Xilinx ISE (a local install, Docker, ssh) with `toolchain: 'ise'`, for a
  trusted project only, as the interface does, and that the MCP server has no tool to program a board or a PROM; the
  header said nothing ran but Silinx's own processes.
