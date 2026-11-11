In detail:

- **`share_project` sends the server's token only to its own server (part of #3181):** the MCP server reads this
  computer's server token only for a loopback address (127.0.0.1, [::1], localhost), and sends it only once the server
  at that port proves it holds it (`server/open-code.js` holdsToken, the token never sent for it); another host needs
  its relay's key (`key`), refused otherwise with a message saying so. The interface's Share Project sends its token to
  its own server only, as before.
