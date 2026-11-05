// The REST route of an example's files (#2826, GET /api/templates/:name/files, server/projects.js exampleFiles): a link
// to an example opens the project of that name as it is when it has the same files; an unknown example, or a name that
// leaves the examples' folder, is a 404.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { scratchEnv, startApp } from './server-helpers.js';

let tmp, app;
before(async () => { tmp = await scratchEnv('silinx-example-files-'); app = await startApp(); });
after(async () => { await app.close(); await fsp.rm(tmp, { recursive: true, force: true }); });

test('an example\'s description and files, silinx.json apart; the same as New Project\'s from it', async () => {
  const r = await app.call('GET', '/templates/traffic/files');
  assert.equal(r.status, 200);
  const dir = path.join(import.meta.dirname, '..', 'examples', 'traffic');
  assert.deepEqual(r.body.project, JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')));
  assert.deepEqual(Object.keys(r.body.files).sort(), ['constraints/traffic.ucf', 'sim/tb_traffic.vhd', 'src/lamps.bool.json', 'src/lamps.vhd', 'src/sevenseg.v', 'src/timer.vhd', 'src/top.vhd', 'src/traffic.fsm.json', 'src/traffic.vhd']);
  assert.equal(r.body.files['src/top.vhd'], fs.readFileSync(path.join(dir, 'src', 'top.vhd'), 'utf8'));
});

test('an unknown example, a name that leaves the folder: 404', async () => {
  for (const [n, name] of [['nothere', 'nothere'], ['%2E%2E%2Fpackage.json', '../package.json'], ['a%2Fb', 'a/b']]) {
    const r = await app.call('GET', `/templates/${n}/files`);
    assert.equal(r.status, 404, n);
    assert.deepEqual(r.body, { error: `unknown example '${name}'` }, n);
  }
  // ('..', encoded or not: the address normalised, no route)
  for (const n of ['..', '%2E%2E']) assert.equal((await app.call('GET', `/templates/${n}/files`)).status, 404, n);
});
