In detail:

- **MCP server: a failed `check_syntax` or `simulate` labelled "Untrusted content" (#3681):** the compiler's lines of a
  design that does not elaborate quote its names and files, so `check_syntax`'s result when it fails, and `simulate`'s
  when the simulation does not start (behavioural or against a model of the flow), are labelled as the other results
  holding a project's own text are (#3528), with `untrusted` in their structured content. A successful `check_syntax`
  is unchanged. Test: mcp-untrusted.
