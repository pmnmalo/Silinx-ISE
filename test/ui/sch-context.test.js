// UI (#1556): the schematic editor's right-click menu on a symbol: Rename… (#1546), Duplicate, Rotate, Mirror, Delete
// with their shortcuts; each of the symbol clicked, or of the whole selection when it is part of it; each one undo
// step. An I/O marker's menu has the same, a net name's Rename… and Delete. In English and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, netlist, generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const P = (x, y) => ({ x, y });
const SUB = `library ieee;
use ieee.std_logic_1164.all;

entity sub is
  port (i : in std_logic; o : out std_logic);
end entity sub;

architecture rtl of sub is
begin
  o <= not i;
end architecture rtl;
`;
const MODS = { sub: { name: 'sub', lang: 'vhdl', ports: [{ name: 'i', dir: 'in', width: 1 }, { name: 'o', dir: 'out', width: 1 }] } };

uiTest('#1556 schematic: Duplicate, Rotate, Mirror, Delete in the right-click menu of a symbol, of the selection; one Undo each (English, Portuguese)', E, async (page) => {
  // a -> U1 -> s -> M1 (sub) -> y
  const doc = newDoc('top', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', name: 'U1', x: 80, y: 90, rot: 0, mirror: false, params: { width: 1 } },
    { id: 'S3', type: 'module', name: 'M1', x: 300, y: 100, rot: 0, mirror: false, params: { module: 'sub', ports: MODS.sub.ports } });
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 480, y: 120 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(240, 100), P(240, 120), P(300, 120)] },
    { id: 'W3', points: [P(420, 120), P(480, 120)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' });
  await makeProject(env, { name: 'CtxPj', top: 'top', files: { 'src/sub.vhd': SUB, 'src/top.sch.json': JSON.stringify(doc) } });
  await page.openProject('CtxPj');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const doc0 = JSON.stringify(await getDoc());
  const clean = async (what) => {
    const d = await getDoc();
    assert.deepEqual(netlist(d, { modules: MODS }).diagnostics.map((x) => x.message), [], `${what}: no warnings`);
    for (const lang of ['vhdl', 'verilog']) assert.deepEqual(generateHdl(d, { lang, modules: MODS }).diagnostics.map((x) => x.message), [], `${what}: no ${lang} warnings`);
  };
  await clean('as opened');
  const SYM = (id) => `${ED} svg .sym[data-id="${id}"] .hitbox`;
  const PORT = `${ED} svg .port[data-id="P1"] .hitbox`, LABEL = `${ED} [data-kind=label][data-id=L1] .hitbox`;
  const menu = () => page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((m) => [m.querySelector('.lbl').textContent, m.querySelector('.sc').textContent]));
  const right = async (target) => {
    await page.rightClick(target);
    await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the menu' });
    return menu();
  };
  const choose = async (label) => {
    const idx = (await menu()).findIndex(([l]) => l === label);
    assert.ok(idx >= 0, `no item ${label}`);
    await page.click('body > .menu-popup > .mi', { index: idx });
    await page.waitFor(() => !document.querySelector('body > .menu-popup'), [], { what: 'the menu closed' });
  };
  const selection = () => page.eval((ed) => [...document.querySelectorAll(`${ed} svg .sel[data-id], ${ed} svg [data-id].sel`)].map((e) => e.dataset.id).sort(), ED);
  const undo = async (what) => {
    await page.key('Escape');
    await page.menu('Edit', 'Undo');
    await page.waitFor((d0) => JSON.stringify(window.Silinx.active.schEditor.getDoc()) === d0, [doc0], { what: `${what}: undone` });
    assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), false, `${what}: one undo step`);
  };
  const sym = async (id) => (await getDoc()).symbols.find((s) => s.id === id);
  const SYMBOL_MENU = [['Rename…', ''], ['Duplicate', ''], ['Rotate', 'Ctrl+R'], ['Mirror', 'Ctrl+M'], ['Delete', 'Del']];

  // M1 alone: its menu, M1 selected
  assert.deepEqual(await right(SYM('S3')), SYMBOL_MENU);
  assert.deepEqual(await selection(), ['S3'], 'the symbol clicked selected');
  // Duplicate: a copy right of it with a fresh name, no wire copied, the copy selected
  await choose('Duplicate');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 3, [], { what: 'duplicated' });
  let d = await getDoc();
  const copy = d.symbols[2];
  // (right of M1's box, 100 wide, by two grid steps)
  assert.deepEqual([copy.type, copy.params.module, copy.name, copy.x, copy.y], ['module', 'sub', 'inst_1', 440, 100]);
  assert.equal(d.wires.length, 3, 'no wire copied');
  assert.deepEqual(await selection(), [copy.id], 'the copy selected');
  await undo('Duplicate');
  // Rotate, Mirror, Delete
  await right(SYM('S3'));
  await choose('Rotate');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[1].rot === 90, [], { what: 'rotated' });
  await undo('Rotate');
  await right(SYM('S3'));
  await choose('Mirror');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[1].mirror === true, [], { what: 'mirrored' });
  await undo('Mirror');
  await right(SYM('S3'));
  await choose('Delete');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 1, [], { what: 'deleted' });
  await undo('Delete');

  // a selection of U1 and M1 (Shift+click): the right-click on M1 keeps it; each command acts on both
  const both = async () => {
    await page.key('Escape');
    await page.click(SYM('S1'));
    await page.click(SYM('S3'), { modifiers: 8 });
    assert.deepEqual(await selection(), ['S1', 'S3']);
    await right(SYM('S3'));
    assert.deepEqual(await selection(), ['S1', 'S3'], 'the selection kept');
  };
  await both();
  await choose('Rotate');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.every((s) => s.rot === 90), [], { what: 'both rotated' });
  await undo('Rotate both');
  await both();
  await choose('Mirror');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.every((s) => s.mirror), [], { what: 'both mirrored' });
  await undo('Mirror both');
  await both();
  await choose('Duplicate');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 4, [], { what: 'both duplicated' });
  d = await getDoc();
  assert.deepEqual(d.symbols.slice(2).map((s) => [s.type, s.name]), [['inv', 'inst_1'], ['module', 'inst_2']]);
  assert.equal(d.wires.length, 3, 'no wire copied');
  await undo('Duplicate both');
  await both();
  await choose('Delete');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 0, [], { what: 'both deleted' });
  await undo('Delete both');
  // a right-click on a symbol outside the selection: that symbol alone
  await page.key('Escape');
  await page.click(SYM('S1'));
  await right(SYM('S3'));
  assert.deepEqual(await selection(), ['S3'], 'the symbol clicked alone');
  await choose('Rotate');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[1].rot === 90, [], { what: 'M1 rotated' });
  assert.equal((await sym('S1')).rot, 0, 'U1 not rotated');
  await undo('Rotate M1');

  // the I/O marker a: the same commands (Duplicate: a_1); the net name s: Rename… and Delete
  await page.key('Escape');
  assert.deepEqual(await right(PORT), SYMBOL_MENU);
  await choose('Duplicate');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 3, [], { what: 'the marker duplicated' });
  assert.equal((await getDoc()).ports[2].name, 'a_1');
  await undo('Duplicate the marker');
  await page.key('Escape');
  assert.deepEqual(await right(LABEL), [['Rename…', ''], ['Delete', 'Del']]);
  await choose('Delete');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels.length === 0, [], { what: 'the net name deleted' });
  await undo('Delete the net name');
  await clean('after the undos');

  // Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.key('Escape');
    assert.deepEqual(await right(SYM('S3')), [['Mudar o Nome…', ''], ['Duplicar', ''], ['Rodar', 'Ctrl+R'], ['Espelhar', 'Ctrl+M'], ['Apagar', 'Del']]);
    await page.key('Escape');
    await page.closeMenus();
    assert.deepEqual(await right(LABEL), [['Mudar o Nome…', ''], ['Apagar', 'Del']]);
    await page.closeMenus();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
