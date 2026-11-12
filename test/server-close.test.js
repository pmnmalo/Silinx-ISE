// A test's server that always closes (#3614, test/server-close.js): a WebSocket still connected, as a failed test of
// the shared projects leaves its participants, kept closeAllConnections + close waiting for ever (the unit tests' CI
// part ran into its time limit); closable's close ends it, and the client is told.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { closable } from './server-close.js';

async function serverWithClient() {
  const srv = http.createServer((q, s) => s.end('ok'));
  const close = closable(srv);
  new WebSocketServer({ server: srv });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const ws = new WebSocket(`ws://127.0.0.1:${srv.address().port}/`);
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  return { srv, close, ws };
}
const within = (p, ms) => Promise.race([p.then(() => true), new Promise(r => setTimeout(() => r(false), ms))]);

test('#3614 the old way: closeAllConnections and close wait while a WebSocket is connected', async () => {
  const { srv, close, ws } = await serverWithClient();
  srv.closeAllConnections();
  const closed = new Promise(r => srv.close(r));
  assert.equal(await within(closed, 500), false, 'srv.close returned with a WebSocket connected');
  ws.terminate();
  await close();
  await closed;
});

test('#3614 closable: the server closed with a WebSocket connected, the client closed', async () => {
  const { close, ws } = await serverWithClient();
  const gone = new Promise(r => ws.once('close', r));
  assert.equal(await within(close(), 2000), true, 'closable\'s close returned');
  assert.equal(await within(gone, 2000), true, 'the client closed');
});

test('#3614 closable: a server with no connection, or whose connections have ended, closes', async () => {
  const srv = http.createServer((q, s) => s.end('ok'));
  const close = closable(srv);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const r = await fetch(`http://127.0.0.1:${srv.address().port}/`, { headers: { connection: 'close' } });
  assert.equal(await r.text(), 'ok');
  assert.equal(await within(close(), 2000), true);
});
