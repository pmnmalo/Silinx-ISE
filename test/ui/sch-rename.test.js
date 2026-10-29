// UI (#1546): the schematic editor's right-click menu on a symbol, an I/O marker and a net name: Rename…, a small
// dialog with the name; an invalid identifier, a reserved word, another instance's or I/O marker's name refused in the
// dialog, which stays open; a good name given in one undo step, the generated HDL with it; no menu on a wire. In
// English and in Portuguese.
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
    assert.equal((await menuItems())[0], item);
    await page.click('body > .menu-popup > .mi');
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
