// The ISE project routes (#405: server/xise-routes.js out of registerImplRoutes in server/impl-routes.js): mounted
// alone they register the .xise export / import / sync and the zip export / import, in that order; registerImplRoutes
// registers them among its own, where they were (the routes themselves: test/server-api.test.js, test/server.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountXiseRoutes } from '../server/xise-routes.js';
import { registerImplRoutes } from '../server/impl-routes.js';

// an api that records what is registered on it: "method path"
function recorder() {
  const calls = [];
  const api = new Proxy({}, { get: (_, m) => (...a) => { calls.push(`${String(m)} ${a.find(x => typeof x === 'string')}`); return api; } });
  return { api, calls };
}
const projects = { HttpError: class extends Error {} };

test('#405 ISE project routes: mounted alone, the .xise and zip routes', () => {
  const { api, calls } = recorder();
  mountXiseRoutes({ P: projects, api, wrap: f => f, bad: m => new Error(m) });
  assert.deepEqual(calls, ['get /projects/:p/export.xise', 'post /projects/import-xise', 'get /projects/:p/export.zip', 'post /projects/import-zip', 'post /projects/:p/sync-xise']);
});

test('#405 ISE project routes: registerImplRoutes registers them last, after its own', () => {
  const { api, calls } = recorder();
  registerImplRoutes(api, { wrap: f => f, projects });
  assert.equal(calls.length, 21);
  assert.ok(calls.includes('post /projects/:p/capture'), 'the capture of the logic analyzer (#3176)');
  assert.deepEqual(calls.slice(-5), ['get /projects/:p/export.xise', 'post /projects/import-xise', 'get /projects/:p/export.zip', 'post /projects/import-zip', 'post /projects/:p/sync-xise']);
});
