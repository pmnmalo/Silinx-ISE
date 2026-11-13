// UI (#1546): the schematic editor's right-click menu on a symbol, an I/O marker and a net name: Rename…, a small
// dialog with the name; an invalid identifier, a reserved word, another instance's or I/O marker's name refused in the
// dialog, which stays open; a good name given in one undo step, the generated HDL with it; no menu on a wire. In
// English and in Portuguese. An instance's name cleared (#3300), in Properties or in Rename…: a fresh automatic inst_n,
// not drawn, undone in one step; an I/O marker's empty name still refused.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
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

uiTest('#1546 schematic: Rename… in the right-click menu of a symbol, an I/O marker, a net name; the refusals; one Undo; the HDL (English, Portuguese)', E, async (page) => {
  // a -> U1 -> s -> M1 (sub) -> y
  const doc = newDoc('top', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', name: 'U1', x: 80, y: 90, rot: 0, mirror: false, params: { width: 1 } },
    { id: 'S3', type: 'module', name: 'M1', x: 300, y: 100, rot: 0, mirror: false, params: { module: 'sub', ports: [{ name: 'i', dir: 'in', width: 1 }, { name: 'o', dir: 'out', width: 1 }] } });
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 480, y: 120 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(240, 100), P(240, 120), P(300, 120)] },
    { id: 'W3', points: [P(420, 120), P(480, 120)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' });
  await makeProject(env, { name: 'RenSymPj', top: 'top', files: { 'src/sub.vhd': SUB, 'src/top.sch.json': JSON.stringify(doc) } });
  await page.openProject('RenSymPj');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const MODS = { sub: { name: 'sub', lang: 'vhdl', ports: [{ name: 'i', dir: 'in', width: 1 }, { name: 'o', dir: 'out', width: 1 }] } };
  // the schematic as drawn: no warnings, in VHDL and in Verilog
  const clean = async (what) => {
    const d = await getDoc();
    assert.deepEqual(netlist(d, { modules: MODS }).diagnostics.map((x) => x.message), [], `${what}: no warnings`);
    for (const lang of ['vhdl', 'verilog']) assert.deepEqual(generateHdl(d, { lang, modules: MODS }).diagnostics.map((x) => x.message), [], `${what}: no ${lang} warnings`);
  };
  await clean('as opened');
  const hdl = () => readWs(env, 'RenSymPj', 'src/top.vhd');
  const hdlHas = (re, what) => page.waitFor(async (src) => new RegExp(src).test(await (await fetch('/api/projects/RenSymPj/file?path=src%2Ftop.vhd')).text()), [re.source], { what, timeout: 15000 });
  const menuItems = () => page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((e) => e.textContent));
  const dialog = () => page.eval(() => { const d = [...document.querySelectorAll('.dlg-overlay')].pop(); return d && { title: d.querySelector('.dlg-title span').textContent, value: d.querySelector('.dlg-body input').value, err: d.querySelector('.se-rename-err').textContent, buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent.trim()) }; });
  const type = (v) => page.eval((x) => { const i = [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-body input'); i.value = x; i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  // right-click on the object, Rename… chosen: its dialog
  const open = async (target, title, item = 'Rename…') => {
    await page.rightClick(target);
    await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the menu' });
    // (a symbol's menu has Symbol Info… first, #2953; a module's instance's, Edit Symbol next, #3755)
    const idx = (await menuItems()).indexOf(item);
    assert.ok(idx === 0 || (idx === 2 && target === SYM), `${item} in the menu: ${await menuItems()}`);
    await page.click('body > .menu-popup > .mi', { index: idx });
    await page.waitDialog(title);
  };
  // a name typed, Rename pressed: refused (said, the dialog open)
  const refused = async (v, msg, ok = 'Rename') => {
    await type(v);
    await page.dialogButton(ok);
    await page.waitFor((m) => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('.se-rename-err')?.textContent === m, [msg], { what: `refused: ${msg}` });
  };
  const SYM = `${ED} svg .sym[data-id="S3"] .hitbox`, PORT = `${ED} svg .port[data-id="P1"] .hitbox`, LABEL = `${ED} [data-kind=label][data-id=L1] .hitbox`;
  const undo = async () => { await page.key('Escape'); await page.menu('Edit', 'Undo'); };

  // the instance M1: selected by the right-click, its dialog; the refusals
  await open(SYM, 'Rename Instance');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-ptitle`)?.textContent, ED), 'Module sub', 'M1 selected');
  assert.deepEqual(await dialog(), { title: 'Rename Instance', value: 'M1', err: '', buttons: ['Rename', 'Cancel'] });
  await refused('1x', "'1x' is not a valid name: use a letter, then letters, digits and single _ (not at the end).");
  await refused('a__b', "'a__b' is not a valid name: use a letter, then letters, digits and single _ (not at the end).");
  await refused('signal', "'signal' is a reserved word of VHDL: choose another name.");
  await refused('Wire', "'Wire' is a reserved word of Verilog: choose another name.");
  await refused('u1', "'u1' is already the name of another instance: choose another name.");
  await refused('A', "'A' is already the name of an I/O marker: choose another name.");
  assert.equal((await getDoc()).symbols[1].name, 'M1', 'nothing changed');
  // a good name: the label drawn, the HDL; one Undo
  await type('core');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[1].name === 'core', [], { what: 'renamed' });
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .sym[data-id="S3"] text`)].some((t) => t.textContent === 'core'), ED), 'the name drawn');
  await clean('renamed');
  await hdlHas(/\bcore : entity work\.sub\b/, 'the HDL with core');
  assert.doesNotMatch(await hdl(), /\bM1\b/);
  await undo();
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[1].name === 'M1', [], { what: 'undone' });
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .sym[data-id="S3"] text`)].some((t) => t.textContent === 'M1'), ED), 'M1 drawn again');
  await hdlHas(/\bM1 : entity work\.sub\b/, 'the HDL with M1 again');
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), false, 'one undo step');

  // the I/O marker a: another marker's or an instance's name refused; din given (the port of the module)
  await open(PORT, 'Rename I/O Marker');
  assert.equal((await dialog()).value, 'a');
  await refused('Y', "'Y' is already the name of another I/O marker: choose another name.");
  await refused('m1', "'m1' is already the name of an instance: choose another name.");
  await refused('', 'Type a name.');
  await type('din');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports[0].name === 'din', [], { what: 'the marker renamed' });
  await clean('marker renamed');
  await hdlHas(/\bdin : in std_logic\b/, 'the HDL with din');
  await undo();
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports[0].name === 'a', [], { what: 'the marker undone' });

  // the net name s: a reserved word refused; a bus name's base checked; mid given (the signal)
  await open(LABEL, 'Rename Net Name');
  assert.equal((await dialog()).value, 's');
  await refused('out', "'out' is a reserved word of VHDL: choose another name.");
  await refused('2d', "'2d' is not a valid name: use a letter, then letters, digits and single _ (not at the end).");
  await type('mid');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels[0].net === 'mid', [], { what: 'the net renamed' });
  await clean('net renamed');
  await hdlHas(/\bsignal mid : std_logic;/, 'the HDL with mid');
  await undo();
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels[0].net === 's', [], { what: 'the net undone' });

  // Cancel: nothing changes; a wire has no menu
  await open(SYM, 'Rename Instance');
  await type('other');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal((await getDoc()).symbols[1].name, 'M1', 'Cancel: unchanged');
  await page.key('Escape');
  await page.rightClick(`${ED} svg [data-kind=wire][data-id=W3] .whit`);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await page.eval(() => document.querySelector('body > .menu-popup')), null, 'no menu on a wire');

  // Portuguese: the menu, the dialog, a refusal
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await open(SYM, 'Mudar o Nome da Instância', 'Mudar o Nome…');
    assert.deepEqual((await dialog()).buttons, ['Mudar o Nome', 'Cancelar']);
    assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-body label').textContent), 'Novo nome:');
    await refused('U1', "'U1' já é o nome de outra instância: escolha outro nome.", 'Mudar o Nome');
    await refused('signal', "'signal' é uma palavra reservada de VHDL: escolha outro nome.", 'Mudar o Nome');
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    await open(PORT, 'Mudar o Nome do Marcador de E/S', 'Mudar o Nome…');
    await page.dialogButton('Cancelar');
    await open(LABEL, 'Mudar o Nome da Rede', 'Mudar o Nome…');
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), false, 'nothing to undo');
});

uiTest('#3300 schematic: an instance\'s name cleared, in Properties and in Rename…, is a fresh inst_n, not drawn; Undo; an I/O marker\'s still refused', E, async (page) => {
  // a -> inv_a -> s -> M1 (sub) -> y; inst_2 another inverter, of an automatic name
  const doc = newDoc('top', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', name: 'inv_a', x: 80, y: 90, rot: 0, mirror: false, params: { width: 1 } },
    { id: 'S2', type: 'inv', name: 'inst_2', x: 80, y: 290, rot: 0, mirror: false, params: { width: 1 } },
    { id: 'S3', type: 'module', name: 'M1', x: 300, y: 100, rot: 0, mirror: false, params: { module: 'sub', ports: [{ name: 'i', dir: 'in', width: 1 }, { name: 'o', dir: 'out', width: 1 }] } });
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 480, y: 120 },
    { id: 'P3', name: 'b', dir: 'in', width: 1, x: 60, y: 300 }, { id: 'P4', name: 'z', dir: 'out', width: 1, x: 200, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(240, 100), P(240, 120), P(300, 120)] },
    { id: 'W3', points: [P(420, 120), P(480, 120)] }, { id: 'W4', points: [P(60, 300), P(80, 300)] }, { id: 'W5', points: [P(160, 300), P(200, 300)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' });
  await makeProject(env, { name: 'RenAutoPj', top: 'top', files: { 'src/sub.vhd': SUB, 'src/top.sch.json': JSON.stringify(doc) } });
  await page.openProject('RenAutoPj');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 3, [ED], { what: 'drawn' });
  const MODS = { sub: { name: 'sub', lang: 'vhdl', ports: [{ name: 'i', dir: 'in', width: 1 }, { name: 'o', dir: 'out', width: 1 }] } };
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const clean = async (what) => {
    const d = await getDoc();
    assert.deepEqual(netlist(d, { modules: MODS }).diagnostics.map((x) => x.message), [], `${what}: no warnings`);
    for (const lang of ['vhdl', 'verilog']) assert.deepEqual(generateHdl(d, { lang, modules: MODS }).diagnostics.map((x) => x.message), [], `${what}: no ${lang} warnings`);
  };
  const names = async () => (await getDoc()).symbols.map((s) => s.name);
  const drawn = (id, name) => page.eval((ed, i, n) => [...document.querySelectorAll(`${ed} svg .sym[data-id="${i}"] text`)].some((t) => t.textContent === n), ED, id, name);
  const hdlHas = (re, what) => page.waitFor(async (src) => new RegExp(src).test(await (await fetch('/api/projects/RenAutoPj/file?path=src%2Ftop.vhd')).text()), [re.source], { what, timeout: 15000 });
  // the Properties panel's field of that label: its value, or set (change)
  const propField = (label) => page.eval((ed, l) => [...document.querySelectorAll(`${ed} .se-props .se-field`)].find((f) => f.querySelector('label')?.textContent === l)?.querySelector('input')?.value, ED, label);
  const setField = (label, v) => page.eval((ed, l, x) => { const i = [...document.querySelectorAll(`${ed} .se-props .se-field`)].find((f) => f.querySelector('label')?.textContent === l).querySelector('input'); i.value = x; i.dispatchEvent(new Event('change', { bubbles: true })); }, ED, label, v);
  const undo = async () => { await page.key('Escape'); await page.menu('Edit', 'Undo'); };
  await clean('as opened');
  assert.equal(await drawn('S2', 'inst_2'), false, 'an automatic name not drawn');

  // Properties: inv_a's name cleared: inst_3 (after inst_2), not drawn, the field showing it; Undo: inv_a again
  await page.click(`${ED} svg .sym[data-id="S1"] .hitbox`);
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .se-props .se-field input`)].some((i) => i.value === 'inv_a'), [ED], { what: 'inv_a selected' });
  assert.equal(await propField('Instance name'), 'inv_a');
  assert.equal(await drawn('S1', 'inv_a'), true);
  await setField('Instance name', '   ');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].name === 'inst_3', [], { what: 'inv_a named inst_3' });
  assert.deepEqual(await names(), ['inst_3', 'inst_2', 'M1']);
  assert.equal(await propField('Instance name'), 'inst_3', 'the field shows it');
  assert.equal(await drawn('S1', 'inst_3'), false, 'not drawn');
  assert.equal(await drawn('S1', 'inv_a'), false);
  await clean('inv_a cleared');
  await undo();
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].name === 'inv_a', [], { what: 'inv_a undone' });
  assert.equal(await drawn('S1', 'inv_a'), true, 'inv_a drawn again');
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), false, 'one undo step');

  // Properties: an I/O marker's name cleared keeps its name
  await page.key('Escape');
  await page.click(`${ED} svg .port[data-id="P1"] .hitbox`);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-ptitle`)?.textContent === 'I/O Marker', [ED], { what: 'a selected' });
  await setField('Name', '');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await getDoc()).ports[0].name, 'a', "a marker's empty name refused");

  // Rename…: M1's name cleared: no refusal, inst_3, not drawn, the HDL with it; Undo: M1 again
  await page.key('Escape');
  await page.rightClick(`${ED} svg .sym[data-id="S3"] .hitbox`);
  await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the menu' });
  // (a symbol's menu has Symbol Info… first, #2953)
  const ren = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')].findIndex((m) => /^(Rename|Mudar o Nome)/.test(m.textContent.trim())));
  assert.ok(ren >= 0, 'Rename… in the menu');
  await page.click('body > .menu-popup > .mi', { index: ren });
  await page.waitDialog('Rename Instance');
  await page.eval(() => { const i = [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-body input'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.se-rename-err').textContent), '', 'no refusal');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[2].name === 'inst_3', [], { what: 'M1 named inst_3' });
  assert.deepEqual(await names(), ['inv_a', 'inst_2', 'inst_3']);
  assert.equal(await drawn('S3', 'inst_3'), false, 'not drawn');
  assert.equal(await drawn('S3', 'M1'), false);
  await clean('M1 cleared');
  await hdlHas(/\binst_3 : entity work\.sub\b/, 'the HDL with inst_3');
  await undo();
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[2].name === 'M1', [], { what: 'M1 undone' });
  assert.equal(await drawn('S3', 'M1'), true, 'M1 drawn again');
  await hdlHas(/\bM1 : entity work\.sub\b/, 'the HDL with M1 again');
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), false, 'one undo step');

  // Portuguese: the dialog takes an empty name with no refusal either
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.rightClick(`${ED} svg .sym[data-id="S3"] .hitbox`);
    await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the menu' });
    await page.click('body > .menu-popup > .mi', { index: await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')].findIndex((m) => /^Mudar o Nome/.test(m.textContent.trim()))) });
    await page.waitDialog('Mudar o Nome da Instância');
    await page.eval(() => { const i = [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-body input'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.se-rename-err').textContent), '');
    await page.dialogButton('Mudar o Nome');
    await page.waitNoDialog();
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[2].name === 'inst_3', [], { what: 'M1 named inst_3 (pt)' });
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
