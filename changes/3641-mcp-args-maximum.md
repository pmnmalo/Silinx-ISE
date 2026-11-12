In detail:

- **MCP server: a schema's `maximum` checked as its `minimum` is (#3641):** the argument check of #3535 did not know
  `maximum`, which `project_link`'s `expires_days` now declares (#3629), and its test refused the schema; a value above
  it is said in the one message (`expires_days: at most 3650`). Test: mcp-args (the keyword, `project_link`'s expiry),
  mcp-gist (the message).
