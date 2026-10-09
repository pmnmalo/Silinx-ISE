// UI: tri-state buffers in the schematic editor — the Tri-State palette category (BUFE / BUFT presets,
// placing a BUFE8), the live simulation of two BUFE on a bus to an inout marker (enables toggled: the
// bus wire is Z / 1 / 0 / X, the marker drives it from outside), and the Symbol Info of BUFT in
// Portuguese (function table with Z, HDL).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ED = '.doc:not([hidden]) .sch-editor';
const DLG = `${ED} .se-symdoc`;

// two BUFE (ua: a / ea, ub: b / eb) driving the 1-bit bus 'data' (an inout marker)
function sheet() {
  const doc = newDoc('tri', 'vhdl');
  doc.symbols.push(
    { id: 'S1', type: 'tbuf', x: 300, y: 100, rot: 0, mirror: false, name: 'ua', params: { width: 1, enable: 'E' } },
    { id: 'S2', type: 'tbuf', x: 300, y: 300, rot: 0, mirror: false, name: 'ub', params: { width: 1, enable: 'E' } });
  const pins = s => Object.fromEntries(symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0]).map(p => [p.name, p]));
  const A = pins(doc.symbols[0]), B = pins(doc.symbols[1]);
  let k = 0;
  for (const [nm, p] of [['a', A.I], ['ea', A.E], ['b', B.I], ['eb', B.E]]) {
    doc.ports.push({ id: `P${++k}`, name: nm, dir: 'in', width: 1, x: p.x - 60, y: p.y });
    doc.wires.push({ id: `W${k}`, points: [{ x: p.x - 60, y: p.y }, { x: p.x, y: p.y }] });
  }
  doc.wires.push({ id: 'Wbus', points: [{ x: A.O.x, y: A.O.y }, { x: 500, y: A.O.y }, { x: 500, y: B.O.y }, { x: B.O.x, y: B.O.y }] });
  doc.wires.push({ id: 'Wio', points: [{ x: 500, y: A.O.y }, { x: 600, y: A.O.y }] });
  doc.ports.push({ id: 'P9', name: 'data', dir: 'inout', width: 1, x: 600, y: A.O.y });
  return doc;
}
const wireLevel = (page, id) => page.eval((sel, w) => [...document.querySelector(`${sel} g.wire[data-id="${w}"]`).classList].find((c) => /^lv-/.test(c)) || null, ED, id);
const waitWire = (page, id, lv) => page.waitFor((sel, w, l) => document.querySelector(`${sel} g.wire[data-id="${w}"]`)?.classList.contains(l), [ED, id, lv], { what: `wire ${id} ${lv}` });

uiTest('tri-state buffers: palette (BUFE8 placed), live simulation of two BUFE on a bus to an inout marker, Symbol Info of BUFT in Portuguese', E, async (page) => {
  const doc = sheet();
  await makeProject(env, { name: 'TriPj', files: { 'src/tri.sch.json': JSON.stringify(doc) } });
  await page.openProject('TriPj');
  await page.eval(() => window.SilinxApp.openSch('src/tri.sch.json'));
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/tri.sch.json' && document.querySelector(`${sel} .se-symrow`), [ED]);
  // the symbols are drawn as triangles with the enable line; the check finds no problem
  assert.equal(await page.eval((sel) => document.querySelectorAll(`${sel} g.sym .gate`).length >= 4, ED), true);

  // ---- palette: the Tri-State category, BUFE / BUFT presets; place a BUFE8, undo
  assert.ok(await page.eval((sel) => [...document.querySelectorAll(`${sel} .se-cat option`)].some((o) => o.value === 'Tri-State'), ED));
  await page.fill(`${ED} .se-cat`, 'Tri-State');
  const names = await page.eval((sel) => [...document.querySelectorAll(`${sel} .se-symrow .nm`)].map((e) => e.textContent), ED);
  assert.deepEqual(names, ['BUFE', 'BUFE4', 'BUFE8', 'BUFE16', 'BUFT', 'BUFT4', 'BUFT8', 'BUFT16', 'TBUF']);
  await page.click(`${ED} .se-symrow`, { text: 'BUFE8' });
  await page.waitFor((sel) => /^BUFE8: /.test(document.querySelector(`${sel} .se-syminfo`)?.textContent || ''), [ED], { what: 'BUFE8 info box' });
  const r = await page.eval((sel) => { const b = document.querySelector(`${sel} .se-canvas`).getBoundingClientRect(); return { x: b.left + b.width * 0.8, y: b.top + b.height * 0.8 }; }, ED);
  await page.click(r);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 3, [], { what: 'BUFE8 placed' });
  assert.deepEqual(await page.eval(() => { const s = window.Silinx.active.schEditor.getDoc().symbols[2]; return [s.type, s.params.width, s.params.enable, !!s.params.bits]; }), ['tbuf', 8, 'E', false]);
  await page.key('Escape');
  await page.key('z', { modifiers: 2 });
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 2, [], { what: 'undo' });
  await page.fill(`${ED} .se-cat`, '<all>');

  // ---- live simulation
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(sel)?.classList.contains('sim-mode') && document.querySelector(`${sel} .se-simlayer .lv-bidir`), [ED], { what: 'simulation mode' });
  const ctl = (n) => `${ED} .se-simlayer .lv-ctl[data-port="${doc.ports.find((p) => p.name === n).id}"]`;
  const marker = `${ED} .se-simlayer .lv-bidir[data-port="P9"]`;
  // both buffers released: the bus is Z (blue), the marker too
  assert.equal(await wireLevel(page, 'Wbus'), 'lv-z');
  assert.ok(await page.eval((s) => document.querySelector(s).classList.contains('lv-z'), marker));
  await page.click(ctl('a'));                                   // a = 1, still released
  await waitWire(page, 'W1', 'lv-1');
  assert.equal(await wireLevel(page, 'Wbus'), 'lv-z');
  await page.click(ctl('ea'));                                  // ua drives 1
  await waitWire(page, 'Wbus', 'lv-1');
  assert.equal(await wireLevel(page, 'Wio'), 'lv-1');
  await page.click(ctl('ea')); await page.click(ctl('eb'));     // ub drives b = 0
  await waitWire(page, 'Wbus', 'lv-0');
  await page.click(ctl('ea'));                                  // both: 1 against 0 -> X (red)
  await waitWire(page, 'Wbus', 'lv-x');
  assert.ok(await page.eval((s) => document.querySelector(s).classList.contains('lv-x'), marker));
  await page.click(ctl('a'));                                   // both drive 0: no conflict
  await waitWire(page, 'Wbus', 'lv-0');
  await page.click(ctl('ea')); await page.click(ctl('eb'));     // released again
  await waitWire(page, 'Wbus', 'lv-z');
  // the inout marker drives the bus from outside: Z -> 0 -> 1
  await page.click(marker);
  await waitWire(page, 'Wbus', 'lv-0');
  await page.click(marker);
  await waitWire(page, 'Wbus', 'lv-1');
  await page.click(ctl('eb'));                                  // ub drives 0 against the outside 1
  await waitWire(page, 'Wbus', 'lv-x');
  await page.key('Escape');
  await page.waitFor((sel) => !document.querySelector(sel).classList.contains('sim-mode'), [ED], { what: 'back to editing' });

  // ---- Symbol Info of BUFT, in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.fill(`${ED} .se-search`, 'BUFT');
  await page.click(`${ED} .se-symrow`, { text: 'BUFT' });
  await page.key('Escape');
  await page.waitFor((sel) => /^BUFT: O buffer de três estados com habilitação ativa a 0/.test(document.querySelector(`${sel} .se-syminfo`)?.textContent || ''), [ED], { what: 'PT info box' });
  await page.click(`${ED} .se-btn[data-act=info]`);
  await page.waitFor((d) => document.querySelector(d)?.dataset.type === 'tbuf' && document.querySelector(`${d} .sd-truth`), [DLG], { what: 'BUFT datasheet' });
  assert.match(await page.eval((d) => document.querySelector(`${d} .se-dhead b`).textContent, DLG), /^Informação do Símbolo: BUFT \(TBUF\)$/);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-main p`).textContent, DLG), /alta impedância/);
  const rows = (sel) => page.eval((s) => [...document.querySelectorAll(s)].map((r) => [...r.cells].map((c) => c.textContent).join(' ')), sel);
  assert.deepEqual(await rows(`${DLG} .sd-pins tbody tr`), [
    'T entrada 1 Controlo de três estados, ativo a 0: 0 = O copia I, 1 = O libertada (Z)',
    'I entrada 1 Entrada de dados',
    'O saída 1 Saída de três estados: I enquanto habilitada, senão Z (pode partilhar a rede com outras saídas de três estados)']);
  // function table with Z (compact: T = 1 releases the output whatever I)
  assert.deepEqual(await rows(`${DLG} .sd-truth tbody tr`), ['0 0 0', '0 1 1', '1 X Z']);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .sd-truth td.vZ`)?.textContent, DLG), 'Z');
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-ttbox`).textContent, DLG), /Z = alta impedância/);
  await page.click(`${DLG} .sd-switch [data-view=full]`);
  await page.waitFor((d) => document.querySelectorAll(`${d} .sd-truth tbody tr`).length === 4, [DLG], { what: 'full table' });
  assert.deepEqual(await rows(`${DLG} .sd-truth tbody tr`), ['0 0 0', '0 1 1', '1 0 Z', '1 1 Z']);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-xnames`).textContent, DLG), /BUFT/);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-code`).textContent, DLG), /O <= I when T = '0' else 'Z';/);
  await page.click(`${DLG} .sd-tabs [data-lang=verilog]`);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-code`).textContent, DLG), /assign O = T \? 1'bz : I;/);
  // the parameters in Portuguese; Width 8: BUFT8, the table per bit
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-params`)?.textContent || document.querySelector(d).textContent, DLG), /Entrada de habilitação/);
  await page.fill(`${DLG} [data-param=width]`, '8');
  await page.waitFor((d) => /BUFT8/.test(document.querySelector(`${d} .se-dhead b`).textContent), [DLG], { what: 'BUFT8' });
  await page.key('Escape');
  await page.waitFor((d) => !document.querySelector(d), [DLG]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});
