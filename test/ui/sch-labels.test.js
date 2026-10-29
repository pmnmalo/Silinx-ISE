// UI: the schematic editor's symbols as ISE draws them: the type of a gate under it (AND2, OR3, INV…),
// no automatic instance id (inst_n, XLXI_n, Un) on the sheet unless Names is checked (#311), a name given by the user shown (#172); the
// palette offers gates of at most 4 inputs (#171).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs, waitDownload } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

uiTest('schematic: gates labelled with their type, no automatic instance ids, the user\'s names kept; no 5-input gates in the palette', E, async (page) => {
  const doc = newDoc('lbl', 'vhdl');
  const add = (type, x, y, params = {}, name) => doc.symbols.push({ id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: name || `XLXI_${doc.symbols.length + 1}`, params: { width: 1, ...params } });
  add('and2', 100, 60); add('or3', 260, 60); add('nand2b1', 420, 60); add('inv', 100, 200); add('xor2', 260, 200, { width: 4 }); add('and2', 420, 200, {}, 'my_gate'); add('fdce', 100, 300, {}, 'U7');
  await makeProject(env, { name: 'Lbl', files: { 'src/lbl.sch.json': JSON.stringify(doc) } });
  await page.openProject('Lbl');
  await page.eval(() => window.SilinxApp.openSch('src/lbl.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 7, [ED], { what: 'the symbols drawn' });
  const texts = (cls) => page.eval((ed, c) => [...document.querySelectorAll(`${ed} svg .sym .${c}`)].map((t) => t.textContent), ED, cls);
  assert.deepEqual((await texts('stype')).sort(), ['AND2', 'AND2', 'FDCE', 'INV', 'NAND2B1', 'OR3', 'XOR2']);
  assert.deepEqual(await texts('iname'), ['my_gate'], 'only the name the user gave');
  // the palette: one AND (its Inputs 2, 3 or 4, #330), no AND5 (wider gates through Width / buses)
  const palette = await page.eval((ed) => [...document.querySelectorAll(`${ed} .se-symrow`)].map((e) => e.textContent.trim()), ED);
  assert.ok(palette.includes('AND'), palette.slice(0, 20).join(', '));
  assert.ok(!palette.some((t) => /^X?N?(AND|OR)\d/.test(t)), 'no AND2 … AND5 entries');
});

uiTest('schematic: a bus takes the name of its input (A(5:0) on its wires), a bus tap dropped on it connects and reads A(0) (#170, #173, #174)', E, async (page) => {
  const { normalizeDoc, symbolPins } = await import('../../core/schdoc.js');
  const doc = newDoc('bus', 'vhdl');
  doc.ports.push({ id: 'P1', name: 'A', dir: 'in', width: 6, x: 100, y: 200 });
  doc.wires.push({ id: 'W1', points: [{ x: 100, y: 200 }, { x: 500, y: 200 }] });
  const tap = { id: 'S1', type: 'slice', x: 0, y: 0, rot: 0, mirror: false, name: 'XLXI_1', params: { msb: 0, lsb: 0 } };
  const ip = symbolPins(normalizeDoc({ ...doc, symbols: [tap] }).symbols[0], {}).find((p) => p.name === 'I');
  tap.x = 300 - ip.x; tap.y = 200 - ip.y; doc.symbols.push(tap);   // its input in the middle of the bus
  const g = { id: 'S2', type: 'and2', x: 300, y: 300, rot: 0, mirror: false, name: 'XLXI_2', params: { width: 6 } };
  doc.symbols.push(g);
  const gp = symbolPins(normalizeDoc({ ...doc, symbols: [g] }).symbols[0], {}).find((p) => p.name === 'I0');
  doc.wires.push({ id: 'W2', points: [{ x: 200, y: 200 }, { x: 200, y: gp.y }, { x: gp.x, y: gp.y }] });
  // (saved before #678: converted on opening, the bus split at the tap and at W2's T-junction; its name
  // still once on the bus)
  doc.version = 2;
  await makeProject(env, { name: 'BusPj', files: { 'src/bus.sch.json': JSON.stringify(doc) } });
  await page.openProject('BusPj');
  await page.eval(() => window.SilinxApp.openSch('src/bus.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .busname`)].map((t) => t.textContent), ED), ['A(5:0)', 'A(5:0)']);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .sym .stext`)].map((t) => t.textContent), ED), ['A(0)']);
  // drawn as ISE's (#1726): a diagonal entry from the bus (the tap's input on it), A(0) on the bit's wire, from inside the symbol
  const tapView = await page.eval((ed) => {
    const g = document.querySelector(`${ed} svg .sym[data-id="S1"]`), box = g.querySelector('.hitbox').getBoundingClientRect(), t = g.querySelector('.stext').getBoundingClientRect();
    const d = g.querySelector('line.pin.bus');
    return { diagonal: d && Math.abs(+d.getAttribute('x2') - +d.getAttribute('x1')) === 10 && Math.abs(+d.getAttribute('y2') - +d.getAttribute('y1')) === 10, inside: t.left >= box.left && t.left < box.right };
  }, ED);
  assert.deepEqual(tapView, { diagonal: true, inside: true });
  // the tap is connected: no unconnected-pin marker on its input, a junction dot where it sits
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .junction`)].some((c) => c.getAttribute('cx') === '300' && c.getAttribute('cy') === '200'), ED));
});

uiTest('schematic: a wire dragged with Keep connections keeps its ends on the markers and wires they touch; without it, it moves whole (#206)', E, async (page) => {
  const doc = newDoc('mv', 'vhdl');
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 400, y: 200 }, { id: 'P3', name: 'z', dir: 'out', width: 1, x: 400, y: 300 });
  // W1 + W3 from a to y, W2 from their joint (a T, as the editor makes it, #678) to z, over W3
  doc.wires.push({ id: 'W1', points: [{ x: 100, y: 100 }, { x: 180, y: 100 }] });
  doc.wires.push({ id: 'W3', points: [{ x: 180, y: 100 }, { x: 250, y: 100 }, { x: 250, y: 200 }, { x: 400, y: 200 }] });
  doc.wires.push({ id: 'W2', points: [{ x: 180, y: 100 }, { x: 180, y: 150 }, { x: 320, y: 150 }, { x: 320, y: 300 }, { x: 400, y: 300 }] });
  await makeProject(env, { name: 'MvPj', files: { 'src/mv.sch.json': JSON.stringify(doc) } });
  await page.openProject('MvPj');
  await page.eval(() => window.SilinxApp.openSch('src/mv.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .port`).length === 3, [ED], { what: 'drawn' });
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg [data-kind=wire] .whit`); const p = l.ownerSVGElement.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(l.getScreenCTM()); return { x: q.x, y: q.y }; }, ED, x, y);
  const wire = (id) => page.eval((i) => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === i).points.map((p) => [p.x, p.y]), id);
  const keep = (on) => page.eval((ed, v) => { const c = [...document.querySelectorAll(`${ed} input[type=checkbox]`)].find((x) => x.parentElement.textContent.includes('Keep connections')); if (c.checked !== v) c.click(); }, ED, on);
  // Keep connections: W3 dragged 40 to the right by its vertical segment: its ends stay on the joint and y
  await keep(true);
  await page.drag(await at(250, 180), await at(290, 180));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W3').points[1].x === 290, [], { what: 'moved' });
  assert.deepEqual(await wire('W3'), [[180, 100], [290, 100], [290, 200], [400, 200]]);
  // its last segment dragged down 20: only that segment moves, its end stays on y (a short segment, #688)
  await page.drag(await at(350, 200), await at(350, 220));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W3').points.length > 4, [], { what: 'moved down' });
  assert.deepEqual(await wire('W3'), [[180, 100], [290, 100], [290, 220], [400, 220], [400, 200]]);
  // W2: its start on the joint (the T) stays there too
  await page.menu('Edit', 'Undo'); await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W3').points[1].x === 250, [], { what: 'undone' });
  await page.drag(await at(320, 250), await at(340, 250));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W2').points.some((p) => p.x === 340), [], { what: 'W2 moved' });
  const w2 = await wire('W2');
  assert.deepEqual([w2[0], w2.at(-1)], [[180, 100], [400, 300]], 'its ends on the joint and z: ' + JSON.stringify(w2));
  assert.ok(w2.some(([x, y]) => x === 340 && y === 300), JSON.stringify(w2));
  // without Keep connections: the wire moves whole
  await page.menu('Edit', 'Undo');
  await keep(false);
  await page.drag(await at(250, 180), await at(290, 180));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W3').points[0].x === 220, [], { what: 'moved whole' });
  assert.deepEqual(await wire('W3'), [[220, 100], [290, 100], [290, 200], [440, 200]]);
  await keep(true);
});

// #311: Names shows every instance's name (the automatic ones too) and every net's name; remembered; no View
// HDL button; a symbol placed is named inst_n
uiTest('#311 schematic: Names shows every instance and net name (also the automatic ones), remembered; no View HDL; new instances inst_n', E, async (page) => {
  const { normalizeDoc, symbolPins } = await import('../../core/schdoc.js');
  const doc = newDoc('nm', 'vhdl');
  const g1 = { id: 'S1', type: 'inv', x: 100, y: 100, rot: 0, mirror: false, name: 'XLXI_1', params: { width: 1 } };
  const g2 = { id: 'S2', type: 'inv', x: 300, y: 100, rot: 0, mirror: false, name: 'my_inv', params: { width: 1 } };
  doc.symbols.push(g1, g2);
  const pin = (s, n) => symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], {}).find((p) => p.name === n);
  const o = pin(g1, 'O'), i = pin(g2, 'I');
  doc.wires.push({ id: 'W1', points: [o, { x: (o.x + i.x) / 2, y: o.y }, { x: (o.x + i.x) / 2, y: i.y }, i] });
  await makeProject(env, { name: 'NamesPj', files: { 'src/nm.sch.json': JSON.stringify(doc) } });
  await page.openProject('NamesPj');
  await page.eval(() => { try { localStorage.removeItem('xl.sch.names'); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openSch('src/nm.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  const names = () => page.eval((ed) => ({ inst: [...document.querySelectorAll(`${ed} svg .sym .iname`)].map((t) => t.textContent).sort(), nets: [...document.querySelectorAll(`${ed} svg .netname`)].map((t) => t.textContent) }), ED);
  assert.deepEqual(await names(), { inst: ['my_inv'], nets: [] }, 'unchecked: as before');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-btn[data-act=view]`), ED), null, 'no View HDL');
  // the checkbox before Check
  assert.deepEqual(await page.eval((ed) => { const n = document.querySelector(`${ed} .se-names`); return [n.textContent, n.nextElementSibling?.dataset.act]; }, ED), ['Names', 'check']);
  await page.click(`${ED} .se-names input`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .netname`).length === 1, [ED], { what: 'the net names' });
  const shown = await names();
  assert.deepEqual(shown.inst, ['XLXI_1', 'my_inv']);
  assert.equal(shown.nets.length, 1);
  assert.match(shown.nets[0], /^net_\d+$/);
  assert.equal(await page.eval(() => localStorage.getItem('xl.sch.names')), '1');
  // a new inverter: inst_n
  await page.fill(`${ED} .se-search`, 'INV');
  await page.click(`${ED} .se-symrow`, { text: 'INV' });
  const c = await page.eval((ed) => { const r = document.querySelector(`${ed} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height - 80 }; }, ED);
  await page.click(c);
  await page.key('Escape');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/NamesPj/file?path=src%2Fnm.sch.json')).text()).symbols.length === 3, [], { what: 'saved' });
  const saved = await page.eval(async () => JSON.parse(await (await fetch('/api/projects/NamesPj/file?path=src%2Fnm.sch.json')).text()));
  assert.equal(saved.symbols[2].name, 'inst_2', 'after XLXI_1: inst_2');
  await page.click(`${ED} .se-names input`);
  await page.eval(() => { try { localStorage.removeItem('xl.sch.names'); } catch { /* none */ } });
});

// #681: an adder, subtractor or comparator shows its width: its type with it under the symbol (ADD8, as the Xilinx
// names), the width by its bus pins, both updated as soon as Width changes; the same in the printed SVG and in
// the Symbol Info drawing
uiTest('#681 schematic: an adder placed shows its width (ADD4, 4 by its bus pins), updated when Width changes; printed and in Symbol Info', E, async (page) => {
  // (a 4-bit CONSTANT already there: its width by its output)
  const doc = newDoc('aw', 'vhdl');
  doc.symbols.push({ id: 'K1', type: 'constant', x: 100, y: 100, rot: 0, mirror: false, name: 'XLXI_1', params: { value: '5', width: 4 } });
  await makeProject(env, { name: 'AddW', files: { 'src/aw.sch.json': JSON.stringify(doc) }, top: '' });
  await page.openProject('AddW');
  await page.eval(() => window.SilinxApp.openSch('src/aw.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .se-symrow`), [ED], { what: 'schematic editor' });
  await page.fill(`${ED} .se-search`, 'adder');
  await page.click(`${ED} .se-symrow`, { text: 'ADD' });
  const c = await page.eval((ed) => { const r = document.querySelector(`${ed} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED);
  await page.click(c);
  await page.key('Escape');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/AddW/file?path=src%2Faw.sch.json')).text()).symbols.length === 2, [], { what: 'ADD saved' });
  const texts = (cls) => page.eval((ed, k) => [...document.querySelectorAll(`${ed} .se-svg g.sym .${k}`)].map((t) => t.textContent), ED, cls);
  // the default width, 8: ADD8, 8 by A, B and S (after the constant's 4)
  assert.deepEqual([await texts('stype'), await texts('pwidth'), await texts('sop')], [['ADD8'], ['4', '8', '8', '8'], ['+']]);
  const sid = JSON.parse(await readWs(env, 'AddW', 'src/aw.sch.json')).symbols[1].id;
  await page.click(`${ED} g.sym[data-id="${sid}"] .hitbox`);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-param=width]`), [ED], { what: 'its properties' });
  await page.fill(`${ED} [data-param=width]`, '4');
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .se-svg g.sym .stype`)].map((t) => t.textContent).join() === 'ADD4', [ED], { what: 'ADD4 drawn' });
  assert.deepEqual(await texts('pwidth'), ['4', '4', '4', '4']);
  await page.fill(`${ED} [data-param=width]`, '16');
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .se-svg g.sym .stype`)].map((t) => t.textContent).join() === 'ADD16', [ED], { what: 'ADD16 drawn' });
  assert.deepEqual(await texts('pwidth'), ['4', '16', '16', '16']);
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/AddW/file?path=src%2Faw.sch.json')).text()).symbols[1].params.width === 16, [], { what: 'width 16 saved' });
  // Symbol Info: its drawing names it ADD16 too
  await page.click(`${ED} .se-props .se-infobtn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-symdoc`)?.dataset.type === 'add', [ED], { what: 'ADD datasheet' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .se-symdoc .sd-svg .stype`)].map((t) => t.textContent), ED), ['ADD16']);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(`${ed} .se-symdoc`), [ED], { what: 'datasheet closed' });
  // printed: the SVG saved from the print preview has the name and the widths
  await page.menu('File', 'Print…');
  await page.waitDialog('Print — Schematic');
  await page.dialogButton('Save SVG');
  const fs = await import('node:fs/promises');
  const svg = await fs.readFile(await waitDownload(page, 'Schematic_src_aw.sch.json.svg'), 'utf8');
  assert.match(svg, />ADD16</);
  assert.equal((svg.match(/>16</g) || []).length, 3, 'the adder\'s three bus widths');
  assert.match(svg, />4</, 'the constant\'s');
  await page.key('Escape');
});

uiTest('#1815 schematic: a bus tap\'s Properties refuse an MSB below its LSB (and an LSB above its MSB), saying why; in Portuguese', E, async (page) => {
  const doc = newDoc('tp', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'slice', x: 300, y: 200, rot: 0, mirror: false, name: 'T1', params: { msb: 2, lsb: 1 } });
  await makeProject(env, { name: 'TapPj', files: { 'src/tp.sch.json': JSON.stringify(doc) } });
  await page.openProject('TapPj');
  await page.eval(() => window.SilinxApp.openSch('src/tp.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="S1"]`), [ED], { what: 'drawn' });
  await page.click(`${ED} svg .sym[data-id="S1"] .hitbox`);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-param=msb]`), [ED], { what: 'the tap\'s properties' });
  const params = () => page.eval(() => window.Silinx.active.schEditor.getDoc().symbols[0].params);
  const hint = (t) => page.waitFor((ed, x) => { const e = document.querySelector(`${ed} .se-hint`); return !!e && !e.hidden && e.textContent === x; }, [ED, t], { what: `the note: ${t}` });
  const set = async (name, v) => { await page.fill(`${ED} [data-param=${name}]`, String(v)); };
  await set('msb', 0);
  await hint('A bus tap takes the bits MSB downto LSB: its MSB (0) cannot be below its LSB (1)');
  assert.deepEqual([await params(), await page.eval((ed) => document.querySelector(`${ed} [data-param=msb]`).value, ED)], [{ msb: 2, lsb: 1 }, '2'], 'refused, the field back');
  await set('lsb', 3);
  await hint('A bus tap takes the bits MSB downto LSB: its LSB (3) cannot be above its MSB (2)');
  assert.deepEqual(await params(), { msb: 2, lsb: 1 });
  await set('msb', 5);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.msb === 5, [], { what: 'MSB 5 taken' });
  await set('lsb', 5);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.lsb === 5, [], { what: 'LSB 5 taken (MSB = LSB)' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await set('msb', 4);
    await hint('Um bus tap tira os bits MSB downto LSB: o seu MSB (4) não pode ser menor que o seu LSB (5)');
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});

// #2036: a name the user gives a symbol drawn inside its shape (its body's centre): a gate, an inverter, a multiplexer,
// a flip-flop, turned too; a name too long for the body above it, as before
uiTest('#2036 schematic: the instance name inside the symbol\'s shape (gates, INV, MUX, FDCE, turned); a long one above it', E, async (page) => {
  const doc = newDoc('inside', 'vhdl');
  const add = (type, x, y, name, rot = 0) => doc.symbols.push({ id: `S${doc.symbols.length + 1}`, type, x, y, rot, mirror: false, name, params: { width: 1 } });
  add('and2', 100, 60, 'u1'); add('inv', 260, 70, 'n1'); add('mux2', 400, 60, 'm1'); add('fdce', 100, 220, 'ff1'); add('or2', 300, 240, 'g2', 90);
  add('and2', 450, 240, 'a_very_long_instance_name');
  await makeProject(env, { name: 'Inside', files: { 'src/inside.sch.json': JSON.stringify(doc) } });
  await page.openProject('Inside');
  await page.eval(() => window.SilinxApp.openSch('src/inside.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 6, [ED], { what: 'the symbols drawn' });
  const where = await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .sym`)].map((g) => {
    const t = g.querySelector('.iname'), body = g.querySelector('.hitbox').getBBox(), r = t.getBBox();
    const inBox = r.x >= body.x - 0.5 && r.x + r.width <= body.x + body.width + 0.5 && r.y >= body.y - 0.5 && r.y + r.height <= body.y + body.height + 0.5;
    return `${t.textContent}:${t.classList.contains('inside') ? 'inside' : 'above'}:${inBox ? 'in' : 'out'}:${r.y + r.height <= body.y + 0.5 ? 'over' : ''}`;
  }), ED);
  assert.deepEqual(where, ['u1:inside:in:', 'n1:inside:in:', 'm1:inside:in:', 'ff1:inside:in:', 'g2:inside:in:', 'a_very_long_instance_name:above:out:over']);
});
