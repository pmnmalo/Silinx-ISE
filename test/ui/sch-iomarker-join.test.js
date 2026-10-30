// UI (#2170): an I/O marker added (Add I/O Marker) or renamed (Rename…, the Properties panel) with the name of a net the schematic has: the
// editor asks whether to join it; Choose another name: not that name (the name asked again, or the marker as it was);
// Join: the marker takes the net's width (count(7:0): 8 bits), one net, the HDL an 8-bit port. A marker placed on
// empty space takes the direction of the marker added last, one on a pin the pin's. In English and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, normalizeDoc, symbolPins, netlist, generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const P = (x, y) => ({ x, y });

// screen position of a sheet point (through the view transform)
const at = (page, x, y) => page.eval((px, py) => {
  const svg = document.querySelector('.doc:not([hidden]) .se-svg');
  const r = svg.getBoundingClientRect();
  const m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)/.exec(svg.querySelector('.se-vp').getAttribute('transform'));
  return { x: r.left + +m[1] + px * +m[3], y: r.top + +m[2] + py * +m[3] };
}, x, y);
const getDoc = (page) => page.eval(() => window.Silinx.active.schEditor.getDoc());
const prompt = (page) => page.eval(() => ({ label: document.querySelector('.se-prompt label')?.textContent, value: document.querySelector('.se-prompt input')?.value }));
const typePrompt = (page, v) => page.eval((x) => { const i = document.querySelector('.se-prompt input'); i.value = x; i.dispatchEvent(new Event('input')); }, v);
const promptOpen = (page) => page.waitFor(() => document.activeElement?.matches('.se-prompt input'), [], { what: 'port name prompt focused' });
const dialogText = (page) => page.eval(() => { const d = [...document.querySelectorAll('.dlg-overlay')].pop(); return { title: d.querySelector('.dlg-title span').textContent, body: d.querySelector('.dlg-body').innerText.trim(), buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent.trim()) }; });
const undo = (page) => page.eval(() => window.Silinx.active.schEditor.undo());

uiTest('#2170 schematic: a new I/O marker on empty space takes the direction of the marker added last; on a pin, the pin\'s', E, async (page) => {
  // U1 with markers a (an input, P1) and y (an output, P2: added last) wired; U2 unwired
  const doc = newDoc('dr', 'vhdl');
  const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
  doc.symbols.push(inv('S1', 'U1', 200, 100), inv('S2', 'U2', 200, 300));
  const pins = (s) => symbolPins(normalizeDoc({ ...newDoc('x', 'vhdl'), symbols: [s] }).symbols[0], {});
  const [I1, O1] = pins(doc.symbols[0]), [I2] = pins(doc.symbols[1]);
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: I1.x - 40, y: I1.y }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: O1.x + 40, y: O1.y });
  doc.wires.push({ id: 'W1', points: [P(I1.x - 40, I1.y), P(I1.x, I1.y)] }, { id: 'W2', points: [P(O1.x, O1.y), P(O1.x + 40, O1.y)] });
  await makeProject(env, { name: 'LastDirPj', files: { 'src/dr.sch.json': JSON.stringify(doc) } });
  await page.openProject('LastDirPj');
  await page.eval(() => window.SilinxApp.openSch('src/dr.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  await page.click(`${ED} .se-btn[data-act=io]`);
  // on empty space: an output, as y (not an input, as before #2170)
  await page.click(await at(page, 120, 220));
  await promptOpen(page);
  assert.deepEqual(await prompt(page), { label: 'Output port name', value: 'out1' });
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 3, [], { what: 'out1 placed' });
  assert.deepEqual((await getDoc(page)).ports.at(-1), { id: 'P3', name: 'out1', dir: 'out', width: 1, x: 120, y: 220 });
  // on U2's input pin: an input (the pin's), though the marker added last is an output
  await page.click(await at(page, I2.x, I2.y));
  await promptOpen(page);
  assert.equal((await prompt(page)).label, 'Input port name');
  await typePrompt(page, 'b');
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 4, [], { what: 'b placed' });
  assert.deepEqual((await getDoc(page)).ports.at(-1), { id: 'P4', name: 'b', dir: 'in', width: 1, x: I2.x, y: I2.y });
  // then on empty space again: an input, as b
  await page.click(await at(page, 300, 220));
  await promptOpen(page);
  assert.deepEqual(await prompt(page), { label: 'Input port name', value: 'in1' });
  await page.key('Escape');
  await page.waitFor(() => !document.querySelector('.se-prompt'), [], { what: 'prompt closed' });
  assert.equal((await getDoc(page)).ports.length, 4);
  // the editor's problems: the marker added unconnected
  assert.deepEqual(netlist(await getDoc(page)).diagnostics.map((d) => d.message),
    ["I/O marker 'out1' is not connected"]);
  await page.key('Escape');
});

uiTest('#2170 schematic: an I/O marker added or renamed with a net\'s name: Join (its width, count(7:0)) or Choose another name; the HDL (English, Portuguese)', E, async (page) => {
  // a(7:0) -> U1 (8 bits) -> a wire named count(7:0); q: an output marker of 1 bit, unconnected (added last)
  const doc = newDoc('jn', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 8 } });
  const [I, O] = symbolPins(normalizeDoc(doc).symbols[0]);
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 8, x: I.x - 40, y: I.y }, { id: 'P2', name: 'q', dir: 'out', width: 1, x: 600, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(I.x - 40, I.y), P(I.x, I.y)] }, { id: 'W2', points: [P(O.x, O.y), P(O.x + 100, O.y)] });
  doc.labels.push({ id: 'L1', x: O.x + 60, y: O.y, net: 'count(7:0)' });
  await makeProject(env, { name: 'JoinPj', files: { 'src/jn.sch.json': JSON.stringify(doc) } });
  await page.openProject('JoinPj');
  await page.eval(() => window.SilinxApp.openSch('src/jn.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'drawn' });
  const QWARN = ["I/O marker 'q' is not connected"];
  assert.deepEqual(netlist(await getDoc(page)).diagnostics.map((d) => d.message), ["net 'count' connects only U1.O", ...QWARN], 'as opened');
  // the schematic with count joined: one 8-bit net, no warnings but q's; its HDL in VHDL and Verilog
  const joined = async (what, id, warnings) => {
    const d = await getDoc(page);
    const nl = netlist(d);
    assert.equal(nl.nets.find((n) => n.ports.includes(id)), nl.wireNet.get('W2'), `${what}: one net`);
    assert.deepEqual(nl.diagnostics.map((x) => x.message), warnings, `${what}: warnings`);
    const v = generateHdl(d, { lang: 'vhdl' }), vl = generateHdl(d, { lang: 'verilog' });
    assert.deepEqual(v.diagnostics.map((x) => x.message), warnings, `${what}: VHDL`);
    assert.deepEqual(vl.diagnostics.map((x) => x.message), warnings, `${what}: Verilog`);
    assert.match(v.code, /count : out std_logic_vector\(7 downto 0\)/, what);
    assert.match(vl.code, /output (wire )?\[7:0\] count/, what);
  };
  const PORTQ = `${ED} svg .port[data-id="P2"] .hitbox`;

  for (const lang of ['en', 'pt']) {
    await page.eval(async (l) => (await import('/js/i18n.js')).setLanguage(l), lang);
    const T = lang === 'en'
      ? { title: 'Net name already used', body: "A net is already named 'count(7:0)'.\nJoin this I/O marker to it? The marker takes the width of the net.", yes: 'Join', no: 'Choose another name', out: 'Output port name', rename: 'Rename I/O Marker', ok: 'Rename' }
      : { title: 'Nome de rede já usado', body: "Já há uma rede chamada 'count(7:0)'.\nJuntar este marcador de E/S a ela? O marcador fica com a largura da rede.", yes: 'Juntar', no: 'Escolher outro nome', out: 'Nome do porto de saída', rename: 'Mudar o Nome do Marcador de E/S', ok: 'Mudar o Nome' };
    // Add I/O Marker on empty space: an output (q, added last), named count: asked
    await page.click(`${ED} .se-btn[data-act=io]`);
    await page.click(await at(page, 500, 240));
    await promptOpen(page);
    assert.deepEqual(await prompt(page), { label: T.out, value: 'out1' }, lang);
    await typePrompt(page, 'count');
    await page.key('Enter');
    await page.waitDialog(T.title);
    assert.deepEqual(await dialogText(page), { title: T.title, body: T.body, buttons: [T.yes, T.no] }, lang);
    // Choose another name: the name asked again; Escape: no marker
    await page.dialogButton(T.no);
    await page.waitNoDialog();
    await promptOpen(page);
    assert.deepEqual(await prompt(page), { label: T.out, value: 'out1' }, `${lang}: asked again`);
    await page.key('Escape');
    await page.waitFor(() => !document.querySelector('.se-prompt'), [], { what: 'prompt closed' });
    assert.equal((await getDoc(page)).ports.length, 2, `${lang}: no marker`);
    // Join: an 8-bit output marker count, of the net
    await page.click(await at(page, 500, 240));
    await promptOpen(page);
    await typePrompt(page, 'count');
    await page.key('Enter');
    await page.waitDialog(T.title);
    await page.dialogButton(T.yes);
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 3, [], { what: 'count placed' });
    assert.deepEqual((await getDoc(page)).ports.at(-1), { id: 'P3', name: 'count', dir: 'out', width: 8, x: 500, y: 240 }, lang);
    await joined(`${lang}: added`, 'P3', QWARN);
    await page.waitFor(async () => /count : out std_logic_vector\(7 downto 0\)/.test(await (await fetch('/api/projects/JoinPj/file?path=src%2Fjn.vhd')).text()), [], { what: 'the HDL follows the schematic', timeout: 15000 });
    await page.key('Escape');
    await undo(page);
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 2, [], { what: 'undone' });

    // Rename… q to count: Choose another name: q as it was; Join: count, 8 bits, the net's
    for (const join of [false, true]) {
      await page.rightClick(PORTQ);
      await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the menu' });
      await page.click('body > .menu-popup > .mi');
      await page.waitDialog(T.rename);
      await page.eval(() => { const i = [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-body input'); i.value = 'count'; i.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.dialogButton(T.ok);
      await page.waitDialog(T.title);
      assert.deepEqual(await dialogText(page), { title: T.title, body: T.body, buttons: [T.yes, T.no] }, `${lang}: rename`);
      await page.dialogButton(join ? T.yes : T.no);
      await page.waitNoDialog();
      if (!join) { assert.deepEqual((await getDoc(page)).ports[1], { id: 'P2', name: 'q', dir: 'out', width: 1, x: 600, y: 300 }, `${lang}: not renamed`); continue; }
      await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports[1].name === 'count', [], { what: 'renamed' });
      assert.deepEqual((await getDoc(page)).ports[1], { id: 'P2', name: 'count', dir: 'out', width: 8, x: 600, y: 300 }, `${lang}: renamed`);
      await joined(`${lang}: renamed`, 'P2', []);
    }
    await undo(page);
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports[1].name === 'q', [], { what: 'rename undone' });
    assert.deepEqual((await getDoc(page)).ports[1].width, 1);

    // the Properties panel's Name of q set to count: Choose another name: q in the field again; Join: count, 8 bits
    await page.click(`${ED} .se-btn[data-act=select]`);
    for (const join of [false, true]) {
      await page.click(PORTQ);
      await page.waitFor((ed) => document.querySelector(`${ed} .se-field input`)?.value === 'q', [ED], { what: 'q\'s properties' });
      await page.eval((ed) => { const i = document.querySelector(`${ed} .se-field input`); i.value = 'count'; i.dispatchEvent(new Event('change', { bubbles: true })); }, ED);
      await page.waitDialog(T.title);
      assert.deepEqual(await dialogText(page), { title: T.title, body: T.body, buttons: [T.yes, T.no] }, `${lang}: Properties`);
      await page.dialogButton(join ? T.yes : T.no);
      await page.waitNoDialog();
      if (!join) {
        await page.waitFor((ed) => document.querySelector(`${ed} .se-field input`)?.value === 'q', [ED], { what: 'the field as it was' });
        assert.equal((await getDoc(page)).ports[1].name, 'q', `${lang}: Properties: not renamed`);
        continue;
      }
      await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports[1].name === 'count', [], { what: 'renamed in Properties' });
      assert.deepEqual((await getDoc(page)).ports[1], { id: 'P2', name: 'count', dir: 'out', width: 8, x: 600, y: 300 }, `${lang}: Properties`);
      await joined(`${lang}: Properties`, 'P2', []);
    }
    await page.key('Escape');
    await undo(page);
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports[1].name === 'q', [], { what: 'Properties rename undone' });
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});
