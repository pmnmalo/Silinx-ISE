In detail:

- **The MCP server's paths with '/' on Windows too (#3611, #3613):** a result's or an error's path after
  `<workspace>` or `<exchange folder>` is written with `/` on every system (`<exchange folder>/traffic.zip`), as a
  tool's arguments take it; on Windows it had the system's `\`.
