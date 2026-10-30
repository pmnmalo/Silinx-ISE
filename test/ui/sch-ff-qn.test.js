// UI: a flip-flop's inverted output QN (#2161): "Inverted output QN (/Q)" in its properties (the label in Portuguese
// too), saved, drawn as a third pin /Q (barred) below Q; tried out, QN shows not Q before and after a clock. Both
// interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';
const ED = `${D} .sch-editor`;

// an FD (QN as given) with a marker on D, C, Q and, when it has it, QN
function sheet(qn) {
  const doc = newDoc('qn', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'fd', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { init: '0', qn } });
  const names = { D: 'd', C: 'clk', Q: 'q', QN: 'qn' };
  for (const p of symbolPins(normalizeDoc(doc).symbols[0], {})) {
    const x = p.dir === 'in' ? p.x - 60 : p.x + 60;
    doc.ports.push({ id: `P${p.name}`, name: names[p.name], dir: p.dir === 'in' ? 'in' : 'out', width: 1, x, y: p.y });
    doc.wires.push({ id: `W${p.name}`, points: [{ x, y: p.y }, { x: p.x, y: p.y }] });
  }
  return doc;
}
const label = (page) => page.eval((d) => document.querySelector(`${d} [data-param=qn]`).closest('.se-field, label')?.textContent.trim(), D);

uiTest('#2161 schematic: a flip-flop\'s Inverted output QN in its properties: a pin /Q below Q, saved; tried out, QN = not Q; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'FfQn', files: { 'src/qn.sch.json': JSON.stringify(sheet(false)), 'src/qn2.sch.json': JSON.stringify({ ...sheet(true), name: 'qn2' }) } });
  await page.openProject('FfQn');
  await page.eval(() => window.SilinxApp.openSch('src/qn.sch.json'));
  await page.waitFor((d) => document.querySelectorAll(`${d} .se-svg g.sym`).length === 1, [D], { what: 'drawn' });
  const pnames = () => page.eval((d) => [...document.querySelectorAll(`${d} .se-svg g.sym[data-id="S1"] text.pname`)].map((t) => `${t.textContent}${t.getAttribute('text-decoration') === 'overline' ? '/' : ''}`), D);
  assert.deepEqual(await pnames(), ['D', 'C', 'Q']);
  await page.click(`${D} g.sym[data-id="S1"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=qn]`), [D], { what: 'Inverted output QN' });
  assert.equal(await label(page), 'Inverted output QN (/Q)');
  assert.equal(await page.eval((d) => document.querySelector(`${d} [data-param=qn]`).checked, D), false);
  await page.click(`${D} [data-param=qn]`);
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/FfQn/file?path=src%2Fqn.sch.json')).text()).symbols[0].params.qn === true, [], { what: 'qn saved' });
  // the pin /Q: its name barred, level with C, below Q
  await page.waitFor((d) => document.querySelectorAll(`${d} .se-svg g.sym[data-id="S1"] text.pname`).length === 4, [D], { what: '/Q drawn' });
  assert.deepEqual(await pnames(), ['D', 'C', 'Q', 'Q/']);
  const ys = await page.eval((d) => [...document.querySelectorAll(`${d} .se-svg g.sym[data-id="S1"] text.pname`)].map((t) => +t.getAttribute('y')), D);
  assert.ok(ys[3] === ys[1] && ys[3] > ys[2], `QN level with C, below Q: ${ys}`);
  // in Portuguese: the checkbox's label
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click(`${D} g.sym[data-id="S1"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=qn]`), [D], { what: 'QN, Portuguese' });
  assert.equal(await label(page), 'Saída invertida QN (/Q)');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // tried out (a sheet with QN wired): qn = 1 while q = 0; d = 1, a clock step: q = 1, qn = 0
  await page.eval(() => window.SilinxApp.openSch('src/qn2.sch.json'));
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/qn2.sch.json' && document.querySelector(`${sel} .se-btn[data-act=sim]`), [ED], { what: 'qn2 open' });
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(`${sel} .se-simlayer .lv-ctl`), [ED], { what: 'Try it' });
  const led = (id) => `${ED} .se-simlayer .lv-out[data-port="${id}"]`;
  await page.waitFor((q, qn) => document.querySelector(q)?.classList.contains('lv-0') && document.querySelector(qn)?.classList.contains('lv-1'), [led('PQ'), led('PQN')], { what: 'q = 0, qn = 1' });
  await page.click(`${ED} .lv-ctl[data-port="PD"]`);
  await page.click(`${ED} .se-simbar .lv-step`);
  await page.waitFor((q, qn) => document.querySelector(q).classList.contains('lv-1') && document.querySelector(qn).classList.contains('lv-0'), [led('PQ'), led('PQN')], { what: 'q = 1, qn = 0 after a clock' });
  assert.deepEqual(page.dialogs, []);
});
