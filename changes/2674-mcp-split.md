In detail:

- **The MCP server split by area (#2674):** `server/mcp.js` keeps the protocol, and its tools move, as they were,
  into modules of their own: the projects and their files (`server/mcp-projects.js`), the HDL's Check Syntax and
  simulation (`server/mcp-hdl.js`), the processes and their reports (`server/mcp-processes.js`) and their helpers
  (`server/mcp-util.js`), before the tools of the rest of the interface join them. No change of behaviour: the
  same tools, in the same order, with the same schemas. Test: test/mcp-modules.test.js.
