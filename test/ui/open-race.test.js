// UI (#1231): a file (or a drawing) whose read is still under way when the user opens another project is not
// opened in that project: two projects with the same paths, project A's read held back until B is open.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('a file read when another project was opened meanwhile is not opened there (#1231)', E, async (page) => {
  await makeProject(env, { name: 'RaceA', template: 'traffic' });
  await makeProject(env, { name: 'RaceB', template: 'traffic' });
  await page.openProject('RaceA');
  for (const [path, opener] of [['src/top.vhd', 'openFile'], ['src/traffic.fsm.json', 'openFsm'], ['src/lamps.bool.json', 'openTt']]) {
    // RaceA's read of the file held back until RaceB is open
    await page.eval(async (p, fn) => {
      const { api } = await import('/js/api.js');
      const real = window.__realRead ||= api.readFile;
      let release;
      window.__gate = new Promise((r) => { release = r; });
      window.__release = release;
      api.readFile = async (name, f) => { const text = await real.call(api, name, f); if (name === 'RaceA' && f === p) { api.readFile = real; await window.__gate; } return text; };
      window.__opening = window.SilinxApp[fn](p);
    }, path, opener);
    await page.openProject('RaceB');
    await page.eval(async () => { window.__release(); await window.__opening; });
    const docs = await page.eval(() => window.Silinx.docs.map((d) => `${d.id} ${d.project}`));
    assert.ok(!docs.some((d) => d.includes(path)), `${opener}: ${docs.join(', ')}`);
    assert.equal(await page.eval(() => window.Silinx.project.name), 'RaceB');
    // and opened in the project it belongs to, when nothing intervenes
    await page.eval((p, fn) => window.SilinxApp[fn](p), path, opener);
    assert.ok((await page.eval(() => window.Silinx.docs.map((d) => `${d.id} ${d.project}`))).some((d) => d.includes(path) && d.endsWith(' RaceB')), opener);
    await page.openProject('RaceA');
  }
  assert.doesNotMatch(await page.consoleText(), /ERROR/);
});
