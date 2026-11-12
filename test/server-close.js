// A test's server that always closes (#3614): its connections kept as they come, the relay's WebSockets too, which
// closeAllConnections leaves (an upgraded connection is no longer the HTTP server's). A test that failed with its
// participants still connected made srv.close wait for ever: the test file never ended, its failure was never
// reported, and the CI's part ran into its time limit.

/** Keeps a listening server's connections; close() ends every one of them, then the server. */
export function closable(srv) {
  const sockets = new Set();
  srv.on('connection', s => { sockets.add(s); s.once('close', () => sockets.delete(s)); });
  return async () => {
    for (const s of sockets) s.destroy();
    await new Promise(r => srv.close(r));
  };
}
