In detail:

- **MCP server: the failed results that quote a design labelled "Untrusted content" (#3681):** the messages of a
  design that does not elaborate or build quote its names and files, so these results are labelled as the other
  results holding a project's own text are (#3528), with `untrusted` in their structured content: `check_syntax` when
  it fails, `simulate` when the simulation does not start (behavioural or against a model of the flow), `run_process`
  when the process fails, `verify` when the check fails (its counterexample's replay prints the design's messages) or
  cannot run, and `c_simulation` when it fails. Their successes are unchanged. Test: mcp-untrusted.
