In detail:

- **The other live sharing tests' servers close with a WebSocket still connected (#3614).** collab.test.js's fix (its
  server's connections destroyed after its tests) is now test/server-close.js's closable, also used by collab-edit,
  collab-relay-config and mcp-collab, whose after() waited the same way for a failed test's participants (srv.close
  with closeAllConnections, which leaves the relay's WebSockets): a failure there is reported, never a hang of the
  file and of the CI's part. Tests: server-close (the old way waits with a WebSocket connected, closable's close does
  not and the client is closed); collab's and server-close's times in test/timings.json.
