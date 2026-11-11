In detail:

- **A project the MCP server makes from an example is never trusted on disk, and a batch runs in order (#3413):** the
  example's files are copied without its `silinx.json`, which is written once, already marked untrusted (`trusted:
  false`, `madeBy: "mcp"`), where the example's was on disk unmarked until the tool's next write; and a JSON-RPC batch's
  requests run one after another, as single messages do, so that a request cannot reach a project its batch is still
  making.
