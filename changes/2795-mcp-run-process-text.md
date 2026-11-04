In detail:

- **MCP run_process: no bare '…' (#2795):** its text gave a `…` line, the separator between the run's errors and
  warnings and the end of its log, also when there were none, the text then beginning with it; it is written only
  after errors or warnings now (`processText`). Test: test/mcp-modules.test.js.
