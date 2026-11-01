// UI: a module's symbol when its module's ports change (#1183): the instance drawn as it was placed, its wires on the
// same pins; marked out of date (its box dashed, Check Schematic's warning, the properties' note); Update Symbol takes
// the module's ports, the wires following their pin by name; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeDoc, netlist, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

const sub = (ports) => `library ieee;\nuse ieee.std_logic_1164.all;\n\nentity sub is\n  port (\n${ports.map(([n, d]) => `    ${n} : ${d} std_logic`).join(';\n')}\n  );\nend entity sub;\n\narchitecture rtl of sub is\nbegin\n  y <= ${ports.some(([n]) => n === 'a') ? 'a' : 'b'} and b;\nend architecture rtl;\n`;
const PORTS = [{ name: 'a', dir: 'in', width: 1 }, { name: 'b', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 1 }];
const MODS = { sub: { name: 'sub', lang: 'vhdl', ports: PORTS } };
// top: the instance, a wire from each pin to an I/O marker
function top() {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name: 'U1', params: { module: 'sub', ports: PORTS } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, MODS)) {
    const b = { x: p.x + (p.side === 'W' ? -60 : 60), y: p.y };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: `n_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: 1, x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', symbols: [s], wires, ports, labels: [] });
}

uiTest('#1183 a module\'s ports changed: its instance drawn as placed, marked out of date; Update Symbol keeps its connections; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'ModSym', top: 'top', files: { 'src/sub.vhd': sub([['a', 'in'], ['b', 'in'], ['y', 'out']]), 'src/top.sch.json': JSON.stringify(top()) } });
  await page.openProject('ModSym');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`), [ED], { what: 'drawn' });
  const pins = () => page.eval(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.ports.map((q) => `${q.name}:${q.dir}`));
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`).classList.contains('stale'), ED), false);
  // the module's ports changed: a removed, c added before b
  await env.server.api('PUT', `/api/projects/ModSym/file?path=${encodeURIComponent('src/sub.vhd')}`, sub([['c', 'in'], ['b', 'in'], ['y', 'out']]));
  await page.eval(() => window.SilinxApp.reloadProject());
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`)?.classList.contains('stale'), [ED], { what: 'marked out of date' });
  assert.deepEqual(await pins(), ['a:in', 'b:in', 'y:out'], 'drawn as placed');
  // the properties: what changed, Update Symbol
  await page.click(`${ED} svg .sym[data-id="U"] .hitbox`);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-stale`), [ED], { what: 'the note' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-stale`).textContent, ED), "The symbol is out of date: module 'sub' changed its ports (added c; removed a).");
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual(await page.eval((ed) => [document.querySelector(`${ed} .se-stale`).textContent, document.querySelector(`${ed} .se-update`).textContent], ED),
    ["O símbolo está desatualizado: o módulo 'sub' mudou os seus portos (acrescentados c; removidos a).", 'Atualizar Símbolo']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // Check Schematic: the warning, and the error of a's pin, connected
  await page.click(`${ED} .se-btn[data-act=check]`);
  // (in the editor's panel, or the console below in the Tasks layout, #993)
  await page.waitFor((ed) => /U1: pin a is connected, but module 'sub' no longer has that port/.test(`${document.querySelector(`${ed} .se-diags`)?.textContent} ${document.getElementById('console-log').textContent}`)
    && /the symbol of module 'sub' is out of date \(its ports: added c; removed a\)/.test(`${document.querySelector(`${ed} .se-diags`)?.textContent} ${document.getElementById('console-log').textContent}`), [ED], { what: 'the check\'s error and warning' });
  // Update Symbol: b and y on their markers still, c unconnected, a's wire left; up to date
  await page.click(`${ED} .se-update`);
  await page.waitFor((ed) => !document.querySelector(`${ed} svg .sym[data-id="U"]`).classList.contains("stale"), [ED], { what: 'up to date' });
  assert.deepEqual(await pins(), ['b:in', 'c:in', 'y:out']);
  const doc = await page.eval(() => window.Silinx.active.schEditor.getDoc());
  const mods = { sub: { name: 'sub', lang: 'vhdl', ports: [{ name: 'c', dir: 'in', width: 1 }, { name: 'b', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 1 }] } };
  const nl = netlist(normalizeDoc(doc), { modules: mods });
  for (const n of ['b', 'y']) assert.equal(nl.pinNet.get(`U/${n}`), nl.portNet.get(`m_${n}`), n);
  assert.deepEqual(nl.diagnostics.filter((d) => d.severity === 'error'), []);
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .se-status`).textContent + document.querySelector(ed).textContent, ED), /Symbol updated; not connected any more: U1\.a/);
  // one undo step back to the symbol of before
  await page.click(`#toolbar [data-cmd=undo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.ports[0].name === 'a', [], { what: 'undone' });
});
