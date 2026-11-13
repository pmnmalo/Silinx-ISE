// UI (#3755): the Symbol Editor. A module's Edit Symbol (the Design pane's right-click menu) makes its symbol file
// (<module>.sym.json, the default symbol) and opens it; a pin selected, moved to another side (its Side in the
// Properties, or dragged there), later on its side (Later ▶), the spacing changed; the main toolbar's Undo undoes one
// step; saved, the schematic's instance of the module is out of date, Update Symbol draws it with the new symbol, every
// pin on its net; its toolbar, side panel (folded, remembered; ☰ on a narrow window) and status line as the other
// editors'; Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeDoc, netlist, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])', SY = `${D} .sym-editor`, ED = `${D} .sch-editor:not(.sy-canvas)`;

const REG = `library ieee;\nuse ieee.std_logic_1164.all;\n\nentity reg1 is\n  port (d, ce, c : in std_logic; q : out std_logic);\nend entity reg1;\n\narchitecture rtl of reg1 is\nbegin\n  process (c) begin\n    if rising_edge(c) then\n      if ce = '1' then q <= d; end if;\n    end if;\n  end process;\nend architecture rtl;\n`;
const PORTS = ['d', 'ce', 'c', 'q'].map((n) => ({ name: n, dir: n === 'q' ? 'out' : 'in', width: 1 }));
const MODS = { reg1: { name: 'reg1', lang: 'vhdl', ports: PORTS } };
// top: the instance (the default symbol), a wire from each pin to an I/O marker
function top() {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name: 'U1', params: { module: 'reg1', generics: {}, ports: PORTS } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, MODS)) {
    const b = { x: p.x + (p.side === 'W' ? -60 : 60), y: p.y };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: `n_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: 1, x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', symbols: [s], wires, ports, labels: [] });
}
const pins = (page) => page.eval(() => window.Silinx.active.symEditor.getSymbol().pins.map((q) => `${q.name}:${q.side}`));
const setLang = (page, l) => page.eval(async (x) => (await import('/js/i18n.js')).setLanguage(x), l);

uiTest('#3755 Edit Symbol: the symbol made and opened; pins moved, by the Properties and by a drag; Undo; saved, Update Symbol in the schematic', E, async (page) => {
  await makeProject(env, { name: 'SymEd', top: 'top', files: { 'src/reg1.vhd': REG, 'src/top.sch.json': JSON.stringify(top()) } });
  await page.setViewport(1440, 900);
  await page.openProject('SymEd');
  // the Design pane: Edit Symbol of reg1 (its instance's row under top)
  await page.treeRow('#hier', 'u1 - reg1', { right: true });
  await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the menu' });
  await page.click('body > .menu-popup .mi', { text: 'Edit Symbol' });
  await page.waitFor((s) => document.querySelector(`${s} .sy-pin`), [SY], { what: 'the Symbol Editor' });
  assert.equal(await page.eval(() => window.Silinx.active.path), 'src/reg1.sym.json');
  assert.ok(await page.eval(() => window.SilinxApp.S.fileTree.includes('src/reg1.sym.json')), 'its file made');
  await page.waitConsole(/src\/reg1\.sym\.json: the symbol of module 'reg1' made \(its default one\)/);
  assert.deepEqual(await pins(page), ['d:W', 'ce:W', 'c:W', 'q:E']);
  const fields = () => page.eval((s) => [...document.querySelectorAll(`${s} .doc-status .ds-f`)].map((f) => f.textContent), SY);
  assert.deepEqual(await fields(), ['4 pin(s)', '80 × 80']);
  // its toolbar: no Undo, Redo or Print of its own; the zooms; the ☰ and ⋮ at its right end
  assert.deepEqual(await page.eval((s) => [...document.querySelectorAll(`${s} .sy-toolbar button`)].filter((x) => /^(Undo|Redo)$|Print/.test(x.title)).length, SY), 0);
  assert.deepEqual(await page.eval((s) => ['zin', 'zout', 'fit'].map((a) => !!document.querySelector(`${s} [data-act=${a}] svg`)), SY), [true, true, true]);
  assert.equal(await page.eval((s) => document.querySelector(`${s} .sy-earlier`).disabled, SY), true, 'no pin selected: Earlier disabled');
  // (Reset to Default a button of the toolbar, no ⋮ menu, #3789)
  assert.deepEqual(await page.eval((s) => [...document.querySelectorAll(`${s} .sy-toolbar > .asm-group:first-child button`)].map((b) => b.textContent), SY), ['◀ Earlier', 'Later ▶', 'Reset to Default']);
  assert.equal(await page.eval((s) => document.querySelector(`${s} .sy-toolbar .tb-menu-btn, ${s} .sy-toolbar [aria-haspopup]`), SY), null, 'no ⋮ menu');

  // the clock c selected: its section; to the bottom by its Side
  await page.click(`${SY} .sy-pin[data-pin="c"]`);
  await page.waitFor((s) => document.querySelector(`${s} .sy-pin-props h3`)?.textContent === 'c', [SY], { what: 'c selected' });
  assert.equal(await page.eval((s) => document.querySelector(`${s} .sy-port`).textContent, SY), 'Input, 1 bit');
  await page.fill(`${SY} .sy-side`, 'S');
  assert.deepEqual(await pins(page), ['d:W', 'ce:W', 'q:E', 'c:S']);
  // q dragged to the left side, above d: on the way, its handle under the pointer and a bar where it will go, no text
  // selected (#3789)
  const from = await page.point(`${SY} .sy-pin[data-pin="q"]`), to = await page.eval((s) => {
    const r = document.querySelector(`${s} .sy-pin[data-pin="d"]`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top - 6 };
  }, SY);
  await page.mouse('mouseMoved', from.x, from.y);
  await page.mouse('mousePressed', from.x, from.y);
  for (let i = 1; i <= 8; i++) await page.mouse('mouseMoved', from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8, { buttons: 1, button: 'left' });
  assert.deepEqual(await page.eval((s) => {
    const g = document.querySelector(`${s} .sy-ghost`)?.getBoundingClientRect(), m = document.querySelector(`${s} .sy-mark`);
    return { ghost: !!g, mark: !!m, across: m ? m.getAttribute('y1') === m.getAttribute('y2') : null, selected: String(getSelection()) };
  }, SY), { ghost: true, mark: true, across: true, selected: '' });
  await page.mouse('mouseReleased', to.x, to.y);
  await page.waitFor(() => window.Silinx.active.symEditor.getSymbol().pins[0].name === 'q', [], { what: 'q dragged' });
  assert.deepEqual(await pins(page), ['q:W', 'd:W', 'ce:W', 'c:S']);
  // q selected (dragged): Later ▶ moves it below d
  await page.click(`${SY} .sy-later`);
  assert.deepEqual(await pins(page), ['d:W', 'q:W', 'ce:W', 'c:S']);
  // the spacing 40: the body taller
  await page.fill(`${SY} .sy-spacing`, '40');
  assert.deepEqual(await fields(), ['4 pin(s)', '80 × 160']);
  assert.equal(await page.eval(() => String(getSelection())), '', 'no text selected (#3789)');
  // the main toolbar's Undo: one step back
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.symEditor.getSymbol().spacing === 20, [], { what: 'undone' });
  assert.deepEqual(await pins(page), ['d:W', 'q:W', 'ce:W', 'c:S']);
  await page.fill(`${SY} .sy-spacing`, '40');
  // Reset to Default: the default symbol; undone, the one edited back
  await page.click(`${SY} .sy-reset`);
  assert.deepEqual(await pins(page), ['d:W', 'ce:W', 'c:W', 'q:E']);
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.symEditor.getSymbol().spacing === 40, [], { what: 'Reset undone' });
  assert.deepEqual(await pins(page), ['d:W', 'q:W', 'ce:W', 'c:S']);

  // Portuguese
  await setLang(page, 'pt');
  assert.deepEqual(await page.eval((s) => [...document.querySelectorAll(`${s} .sy-later, ${s} .sy-earlier, ${s} .sy-symbol-props h3, ${s} .sy-symbol-props .asm-label, ${s} .sy-pin-props .asm-label, ${s} .asm-side .asm-cap`)].map((e) => e.firstChild.textContent.trim()), SY),
    ['◀ Antes', 'Depois ▶', 'Propriedades', 'Saída, 1 bit', 'Lado', 'Posição', 'Símbolo', 'Espaçamento dos pinos', 'Largura', 'Altura', 'Nome do módulo']);
  await page.waitFor((s) => document.querySelector(`${s} .doc-status .ds-f`).textContent === '4 pino(s)', [SY], { what: 'the status line in Portuguese' });
  assert.equal(await page.eval((s) => document.querySelector(`${s} .sy-reset`).textContent, SY), 'Repor o Predefinido');
  assert.deepEqual(await page.eval((s) => [...document.querySelectorAll(`${s} .sy-side option`)].map((o) => o.textContent), SY), ['Esquerda', 'Direita', 'Topo', 'Base']);
  await setLang(page, 'en');

  // saved: the schematic's instance out of date; Update Symbol: its pins where the symbol has them, on their nets
  await page.key('s', { modifiers: 2 });
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  const file = JSON.parse(await env.server.api('GET', `/api/projects/SymEd/file?path=${encodeURIComponent('src/reg1.sym.json')}`));
  assert.deepEqual(file, { version: 1, kind: 'symbol', module: 'reg1', pins: [{ name: 'd', side: 'W' }, { name: 'q', side: 'W' }, { name: 'ce', side: 'W' }, { name: 'c', side: 'S' }], spacing: 40, width: null, height: null, title: 'top' });
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`)?.classList.contains('stale'), [ED], { what: 'out of date' });
  await page.click(`${ED} svg .sym[data-id="U"] .hitbox`);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-stale`), [ED], { what: 'the note' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-stale`).textContent, ED), "The symbol is out of date: module 'reg1' has a new symbol.");
  await setLang(page, 'pt');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-stale`).textContent, ED), "O símbolo está desatualizado: o módulo 'reg1' tem um símbolo novo.");
  await setLang(page, 'en');
  await page.click(`${ED} .se-update`);
  await page.waitFor((ed) => !document.querySelector(`${ed} svg .sym[data-id="U"]`).classList.contains('stale'), [ED], { what: 'up to date' });
  const doc = await page.eval(() => window.Silinx.active.schEditor.getDoc());
  assert.deepEqual(doc.symbols[0].params.ports.map((q) => `${q.name}:${q.side}`), ['d:W', 'q:W', 'ce:W', 'c:S']);
  const nl = netlist(normalizeDoc(doc), { modules: { reg1: { ...MODS.reg1, symbol: file } } });
  for (const n of ['d', 'ce', 'c', 'q']) assert.equal(nl.pinNet.get(`U/${n}`), nl.portNet.get(`m_${n}`), n);
  assert.deepEqual(nl.diagnostics.map((d) => d.message), [], 'no warnings');
  // a module instance's right-click menu: Edit Symbol opens it again
  await page.rightClick(`${ED} svg .sym[data-id="U"] .hitbox`);
  await page.click('body > .menu-popup .mi', { text: 'Edit Symbol' });
  await page.waitFor(() => window.Silinx.active?.path === 'src/reg1.sym.json', [], { what: 'the symbol in front' });
  // its Properties' Edit Symbol too (#3791), in Portuguese its tip
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor(() => window.Silinx.active?.path === 'src/top.sch.json', [], { what: 'the schematic in front' });
  await page.click(`${ED} svg .sym[data-id="U"] .hitbox`);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-editsym`), [ED], { what: 'its Edit Symbol button' });
  await setLang(page, 'pt');
  assert.deepEqual(await page.eval((ed) => { const b = document.querySelector(`${ed} .se-editsym`); return [b.textContent, b.title]; }, ED), ['Editar Símbolo', 'O símbolo do seu módulo no Editor de Símbolos']);
  await setLang(page, 'en');
  await page.click(`${ED} .se-editsym`);
  await page.waitFor(() => window.Silinx.active?.path === 'src/reg1.sym.json', [], { what: 'the symbol in front again' });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });

uiTest('#3755 the Symbol Editor\'s Properties fold and expand, remembered; on a narrow window over the canvas behind ☰ Properties', E, async (page) => {
  await makeProject(env, { name: 'SymFold', top: 'reg1', files: { 'src/reg1.vhd': REG, 'src/reg1.sym.json': JSON.stringify({ version: 1, kind: 'symbol', module: 'reg1', pins: PORTS.map((q) => ({ name: q.name, side: q.dir === 'out' ? 'E' : 'W' })), spacing: 20, width: null, height: null, title: 'top' }) } });
  await page.setViewport(1440, 900);
  await page.openProject('SymFold');
  await page.eval(() => window.SilinxApp.openFile('src/reg1.sym.json'));
  await page.waitFor((s) => document.querySelector(`${s} .sy-pin`), [SY], { what: 'the Symbol Editor' });
  assert.equal(await page.eval(() => !!window.Silinx.active.dirty), false, 'opened unchanged');
  const state = () => page.eval((s) => { const e = document.querySelector(s); return { folded: e.classList.contains('props-folded'), side: Math.round(e.querySelector('.asm-side').getBoundingClientRect().width) }; }, SY);
  assert.deepEqual(await state(), { folded: false, side: 250 });
  await page.click(`${SY} .asm-side .asm-fold`);
  assert.deepEqual(await state(), { folded: true, side: 24 });
  await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.active));
  await page.eval(() => window.SilinxApp.openFile('src/reg1.sym.json'));
  await page.waitFor((s) => document.querySelector(`${s} .sy-pin`), [SY], { what: 'opened again' });
  assert.equal((await state()).folded, true, 'remembered');
  await page.click(`${SY} .asm-side`);
  assert.equal((await state()).folded, false, 'expanded by a click on the strip');
  // narrow: the panel over the canvas, closed, shown by ☰ Properties
  await page.setViewport(800, 900);
  // (the ISE style's drawer of the project's panes, over the document on a narrow window: closed)
  await page.eval(async () => (await import('/js/narrow.js')).setDrawer(false));
  const btn = `${SY} .sy-toolbar .narrow-only`;
  await page.waitFor((b) => document.querySelector(b)?.getClientRects().length > 0, [btn], { what: 'the ☰ button' });
  const shown = () => page.eval((s) => document.querySelector(s).classList.contains('side-open') && document.querySelector(`${s} .asm-side`).getClientRects().length > 0, SY);
  assert.equal(await shown(), false);
  await page.click(btn);
  assert.equal(await shown(), true);
  await page.click(btn);
  assert.equal(await shown(), false);
  await page.setViewport(1440, 900);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
