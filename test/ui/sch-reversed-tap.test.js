// UI: a bus tap the wrong way round on a counter's bus (#1702): the bus still drawn as a bus (it was drawn as a 1-bit
// wire), the tap's O not connected, and Check reports the tap. The netlist: test/schdoc-reversed-tap.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const ERR = "bus tap T1 is the wrong way round: its output O (1 bit) touches the 8-bit bus 'net_1' and is not connected to it; the bus goes to its input I";

// a counter's Q(7:0) (500, 10) down to (500, 210), on to the tap's O (340, 210); the tap's I (300, 200) to y
function schematic() {
  const d = newDoc('rtap', 'vhdl');
  d.symbols.push({ id: 'S1', type: 'slice', x: 300, y: 200, rot: 0, mirror: false, name: 'T1', params: { msb: 2, lsb: 2 } },
    { id: 'S2', type: 'counter', x: 410, y: 0, rot: 0, mirror: false, name: 'C1', params: { width: 8 } });
  d.wires.push({ id: 'W1', points: [{ x: 500, y: 210 }, { x: 340, y: 210 }] }, { id: 'W3', points: [{ x: 500, y: 210 }, { x: 500, y: 10 }] },
    { id: 'W2', points: [{ x: 300, y: 200 }, { x: 200, y: 200 }] });
  d.ports.push({ id: 'P2', name: 'y', dir: 'out', width: 1, x: 200, y: 200 });
  return d;
}

uiTest('#1702 a bus tap the wrong way round: the bus still drawn as a bus, Check reports the tap', E, async (page) => {
  await makeProject(env, { name: 'RevTap', files: { 'src/rtap.sch.json': JSON.stringify(schematic()) } });
  await page.openProject('RevTap');
  await page.eval(() => window.SilinxApp.openSch('src/rtap.sch.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'sch:src/rtap.sch.json' && document.querySelector(`${ed} [data-kind=wire]`), [ED], { what: 'the schematic editor' });
  const drawn = await page.eval((ed) => Object.fromEntries([...document.querySelectorAll(`${ed} [data-kind=wire]`)].map((g) => [g.dataset.id, g.classList.contains('bus')])), ED);
  assert.deepEqual(drawn, { W1: true, W3: true, W2: false });
  await page.click(`${ED} .se-btn[data-act=check]`);
  // (in the editor's panel in the ISE style interface; in the console in the Silinx one, #993, #1149)
  if (await page.eval(() => document.documentElement.dataset.layout === 'tasks')) await page.waitConsole(new RegExp(ERR.replace(/[()]/g, '\\$&')));
  else {
    // (the netlist's warnings, and the HDL's: C1's outputs not connected)
    await page.waitFor((ed) => /^Check Schematic: 1 error\(s\), 6 warning\(s\)/.test(document.querySelector(`${ed} .se-diags`)?.textContent || ''), [ED], { what: 'the check in the panel' });
    assert.ok((await page.eval((ed) => document.querySelector(`${ed} .se-diags`).textContent, ED)).includes(ERR));
  }
});
