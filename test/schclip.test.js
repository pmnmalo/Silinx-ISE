// Copy and paste of a schematic's selection (#677, core/schclip.js): what is carried along, the names made fresh,
// the connections kept to the copied parts only, and the HDL of a pasted schematic compiled and simulated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { newDoc, normalizeDoc, netlist, generateHdl, symbolPins } from '../core/schdoc.js';
import { copySchematic, pasteSchematic, pasteOffset, clipEmpty } from '../core/schclip.js';

const pin = (doc, id, name) => { const s = doc.symbols.find(x => x.id === id); const p = symbolPins(s).find(q => q.name === name); return { x: p.x, y: p.y }; };
const names = arr => arr.map(o => o.name ?? o.net).sort();

// a ── U1 ──(mid)── U2 ── y : two inverters in a row, the wire between them named mid
function chain(lang = 'vhdl', name = 'chain') {
  const doc = normalizeDoc({ ...newDoc(name, lang),
    symbols: [{ id: 'S1', type: 'inv', x: 200, y: 100, name: 'U1' }, { id: 'S2', type: 'inv', x: 400, y: 100, name: 'U2' }],
    ports: [{ id: 'P1', name: 'a', dir: 'in', width: 1, x: 120, y: 110 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 540, y: 110 }] });
  doc.wires.push({ id: 'W1', points: [{ x: 120, y: 110 }, pin(doc, 'S1', 'I')] });
  doc.wires.push({ id: 'W2', points: [pin(doc, 'S1', 'O'), pin(doc, 'S2', 'I')] });
  doc.wires.push({ id: 'W3', points: [pin(doc, 'S2', 'O'), { x: 540, y: 110 }] });
  doc.labels.push({ id: 'L1', x: 300, y: 110, net: 'mid' });
  return doc;
}
const errorsAndWarnings = doc => netlist(doc).diagnostics.map(d => `${d.severity}: ${d.message}`);

test('the chain itself has no errors nor warnings', () => {
  assert.deepEqual(errorsAndWarnings(chain()), []);
});

test('copy: the wires joining the copied parts come along with their net names, the wires to parts left behind do not', () => {
  const doc = chain();
  const clip = copySchematic(doc, { symbols: ['S1', 'S2'] });
  assert.deepEqual(clip.symbols.map(s => s.id), ['S1', 'S2']);
  assert.deepEqual(clip.wires.map(w => w.id), ['W2'], 'only the wire between the two gates (W1, W3 lead to the markers left behind)');
  assert.deepEqual(clip.labels.map(l => l.net), ['mid'], 'the net name on the wire carried');
  assert.deepEqual(clip.ports, []);
  assert.equal(clip.from, 'chain');
  assert.equal(clip.lang, 'vhdl');
  // with the markers: every wire
  const all = copySchematic(doc, { symbols: ['S1', 'S2'], ports: ['P1', 'P2'] });
  assert.deepEqual(all.wires.map(w => w.id), ['W1', 'W2', 'W3']);
  // one gate: no wire (each leads to something left behind); a wire selected is copied as it is
  assert.deepEqual(copySchematic(doc, { symbols: ['S1'] }).wires, []);
  assert.deepEqual(copySchematic(doc, { symbols: ['S1'], wires: ['W3'] }).wires.map(w => w.id), ['W3']);
  // nothing selected: an empty clipboard
  assert.ok(clipEmpty(copySchematic(doc, {})));
  assert.ok(clipEmpty(null));
  assert.ok(!clipEmpty(clip));
});

test('copy: a wire leaning on a wire that leads elsewhere is not carried (in turn), a T-junction between copied parts is', () => {
  const doc = chain();
  // a third gate fed from mid by a branch (a T on W2): its wire leans on W2
  doc.symbols.push(normalizeDoc({ symbols: [{ id: 'S3', type: 'inv', x: 400, y: 200, name: 'U3' }] }).symbols[0]);
  const i3 = pin(doc, 'S3', 'I');
  doc.wires.push({ id: 'W4', points: [{ x: 300, y: 110 }, { x: 300, y: i3.y }, i3] });
  // U1, U2 copied: W2 joins them; W4 leads to U3, left behind
  assert.deepEqual(copySchematic(doc, { symbols: ['S1', 'S2'] }).wires.map(w => w.id), ['W2']);
  // U1, U3 copied: W4 leans on W2, which leads to U2 left behind: neither
  assert.deepEqual(copySchematic(doc, { symbols: ['S1', 'S3'] }).wires.map(w => w.id), []);
  // all three: both
  assert.deepEqual(copySchematic(doc, { symbols: ['S1', 'S2', 'S3'] }).wires.map(w => w.id), ['W2', 'W4']);
  // a loose pair of wires leaning on each other, far from the copied parts: not carried
  doc.wires.push({ id: 'W5', points: [{ x: 800, y: 800 }, { x: 900, y: 800 }] }, { id: 'W6', points: [{ x: 900, y: 800 }, { x: 800, y: 800 }] });
  assert.deepEqual(copySchematic(doc, { symbols: ['S1', 'S2'] }).wires.map(w => w.id), ['W2']);
});

test('paste into the same sheet: offset, fresh ids, instance, marker and net names that collide with nothing', () => {
  const doc = chain();
  const clip = copySchematic(doc, { symbols: ['S1', 'S2'], ports: ['P1', 'P2'], wires: [], labels: ['L1'] });
  const { ids, renamed } = pasteSchematic(doc, clip, { dx: 0, dy: 200 });
  assert.deepEqual(ids, { symbols: ['S3', 'S4'], wires: ['W4', 'W5', 'W6'], ports: ['P3', 'P4'], labels: ['L2'] });
  assert.deepEqual(names(doc.symbols), ['U1', 'U2', 'inst_1', 'inst_2']);
  assert.deepEqual(Object.fromEntries(renamed.instances), { U1: 'inst_1', U2: 'inst_2' });
  assert.deepEqual(names(doc.ports), ['a', 'a_1', 'y', 'y_1']);
  assert.deepEqual(names(doc.labels), ['mid', 'mid_1']);
  assert.deepEqual(Object.fromEntries(renamed.nets), { mid: 'mid_1' });
  const s3 = doc.symbols.find(s => s.id === 'S3');
  assert.deepEqual([s3.x, s3.y], [200, 300]);
  assert.deepEqual(doc.wires.find(w => w.id === 'W5').points, [{ x: 280, y: 310 }, { x: 400, y: 310 }]);
  // two circuits, nothing shorted: four separate nets and no diagnostics
  assert.deepEqual(errorsAndWarnings(doc), []);
  const nl = netlist(doc);
  assert.notEqual(nl.pinNet.get('S1/O'), nl.pinNet.get('S3/O'));
  assert.equal(nl.pinNet.get('S3/O').name, 'mid_1');
  // pasted again: the next names
  pasteSchematic(doc, clip, { dx: 0, dy: 400 });
  assert.deepEqual(names(doc.symbols), ['U1', 'U2', 'inst_1', 'inst_2', 'inst_3', 'inst_4']);
  assert.deepEqual(names(doc.ports), ['a', 'a_1', 'a_2', 'y', 'y_1', 'y_2']);
  assert.deepEqual(names(doc.labels), ['mid', 'mid_1', 'mid_2']);
  assert.deepEqual(errorsAndWarnings(doc), []);
});

test('paste into another schematic: nothing collides, nothing renamed; one that has those names: renamed past them', () => {
  const clip = copySchematic(chain(), { symbols: ['S1', 'S2'], ports: ['P1', 'P2'] });
  const empty = normalizeDoc(newDoc('other', 'vhdl'));
  const r = pasteSchematic(empty, clip);
  assert.equal(r.renamed.instances.size + r.renamed.ports.size + r.renamed.nets.size, 0);
  assert.deepEqual(names(empty.symbols), ['U1', 'U2']);
  assert.deepEqual(names(empty.labels), ['mid']);
  assert.deepEqual(errorsAndWarnings(empty), []);
  // a sheet with an inst_1, a U1, a net MID (VHDL: the same name as mid), a mid_1 and a marker y
  const busy = normalizeDoc({ ...newDoc('busy', 'vhdl'), symbols: [{ id: 'S1', type: 'inv', x: 600, y: 600, name: 'U1' }, { id: 'S2', type: 'inv', x: 800, y: 600, name: 'inst_1' }],
    labels: [{ id: 'L1', x: 0, y: 0, net: 'MID' }, { id: 'L2', x: 0, y: 20, net: 'mid_1' }], ports: [{ id: 'P1', name: 'Y', dir: 'out', width: 1, x: 1000, y: 610 }] });
  const r2 = pasteSchematic(busy, clip);
  assert.deepEqual(Object.fromEntries(r2.renamed.instances), { U1: 'inst_2' });
  assert.deepEqual(names(busy.symbols), ['U1', 'U2', 'inst_1', 'inst_2']);
  assert.deepEqual(names(busy.labels), ['MID', 'mid_1', 'mid_2']);
  assert.deepEqual(names(busy.ports), ['Y', 'a', 'y_1']);
  // Verilog: names differ by case, nothing renamed but U1
  const v = normalizeDoc({ ...newDoc('busy', 'verilog'), symbols: [{ id: 'S1', type: 'inv', x: 600, y: 600, name: 'U1' }], labels: [{ id: 'L1', x: 0, y: 0, net: 'MID' }], ports: [{ id: 'P1', name: 'Y', dir: 'out', width: 1, x: 1000, y: 610 }] });
  const r3 = pasteSchematic(v, clip);
  assert.deepEqual(Object.fromEntries(r3.renamed.instances), { U1: 'inst_1' });
  assert.deepEqual(names(v.labels), ['MID', 'mid']);
  assert.deepEqual(names(v.ports), ['Y', 'a', 'y']);
});

test('paste: a net name of a marker of the sheet is kept (it joins that port); a bus name keeps its range', () => {
  const doc = chain();
  // a fourth gate whose input is named a by a label on a stub: the same net as the marker a
  doc.symbols.push(normalizeDoc({ symbols: [{ id: 'S3', type: 'inv', x: 200, y: 300, name: 'U3' }] }).symbols[0]);
  const i3 = pin(doc, 'S3', 'I');
  doc.wires.push({ id: 'W4', points: [{ x: i3.x - 40, y: i3.y }, i3] });
  doc.labels.push({ id: 'L2', x: i3.x - 40, y: i3.y, net: 'a' }, { id: 'L3', x: 0, y: 0, net: 'd(3:0)' });
  const clip = copySchematic(doc, { symbols: ['S3'], wires: ['W4'], labels: ['L3'] });
  assert.deepEqual(clip.labels.map(l => l.net).sort(), ['a', 'd(3:0)']);
  pasteSchematic(doc, clip, { dx: 0, dy: 100 });
  assert.deepEqual(names(doc.labels), ['a', 'a', 'd(3:0)', 'd_1(3:0)', 'mid']);
  const nl = netlist(doc);
  const pasted = doc.symbols.at(-1);
  assert.equal(nl.pinNet.get(`${pasted.id}/I`).name, 'a', 'the pasted gate reads the port a');
});

test('paste: a clipboard from the outside is normalized; garbage pastes nothing', () => {
  const doc = chain();
  const before = JSON.stringify(doc);
  for (const junk of [null, {}, { symbols: 'x' }, { symbols: [{ nope: 1 }], wires: [{ points: [{ x: 1, y: 1 }] }], ports: [{ dir: 'in' }], labels: [{ x: 1 }] }]) {
    const { ids } = pasteSchematic(doc, junk);
    assert.deepEqual(ids, { symbols: [], wires: [], ports: [], labels: [] });
  }
  assert.equal(JSON.stringify(doc), before);
  // off-grid coordinates and offsets are snapped
  const { ids } = pasteSchematic(doc, { symbols: [{ type: 'inv', x: 703, y: 497, name: 'k' }] }, { dx: 14, dy: -6 });
  const s = doc.symbols.find(x => x.id === ids.symbols[0]);
  assert.deepEqual([s.x, s.y, s.name], [710, 490, 'k']);
});

// the HDL of a pasted schematic: compiled and simulated, in VHDL and in Verilog
for (const lang of ['vhdl', 'verilog']) {
  test(`a pasted schematic's ${lang === 'vhdl' ? 'VHDL' : 'Verilog'}: compiles, elaborates, simulates; the copy works as the original`, () => {
    const doc = chain(lang, 'twice');
    pasteSchematic(doc, copySchematic(doc, { symbols: ['S1', 'S2'], ports: ['P1', 'P2'] }), { dx: 0, dy: 200 });
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.map(d => `${d.severity}: ${d.message}`), [], g.code);
    const tb = lang === 'vhdl' ? `
library ieee; use ieee.std_logic_1164.all;
entity tb is end;
architecture s of tb is
  signal a, y, a_1, y_1 : std_logic;
begin
  u : entity work.twice port map (a => a, y => y, a_1 => a_1, y_1 => y_1);
  process begin
    a <= '0'; a_1 <= '1'; wait for 10 ns;
    assert y = '0' and y_1 = '1' report "bad 01" severity error;
    a <= '1'; a_1 <= '0'; wait for 10 ns;
    assert y = '1' and y_1 = '0' report "bad 10" severity error;
    report "done"; wait;
  end process;
end;` : `
module tb;
  reg a, a_1; wire y, y_1; integer errs = 0;
  twice u (.a(a), .y(y), .a_1(a_1), .y_1(y_1));
  initial begin
    a = 0; a_1 = 1; #10; if (y !== 0 || y_1 !== 1) errs = errs + 1;
    a = 1; a_1 = 0; #10; if (y !== 1 || y_1 !== 0) errs = errs + 1;
    $display("errs=%0d", errs);
  end
endmodule`;
    const r = simulate([{ path: g.filename, text: g.code }, { path: lang === 'vhdl' ? 'tb.vhd' : 'tb.v', text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], 'compile / elaboration errors');
    assert.deepEqual([...r.lib.errors, ...r.design.diags].filter(d => d.severity === 'warning').map(d => d.message), [], 'no compile / elaboration warnings');
    const log = r.sim.log.map(l => `${l.kind}:${l.text}`);
    assert.deepEqual(r.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure' || l.kind === 'warning'), [], g.code);
    assert.ok(log.includes(lang === 'vhdl' ? 'note:done' : 'print:errs=0'), log.join('\n'));
  });
}

// #1797: where a paste goes. The copy's box (its symbols with their names above, markers, net names, wires) centred on
// the mouse, or else in the blank place of the part in view nearest to its centre, never on what is drawn there
const boxOf = (doc, ids) => {
  const xs = [], ys = [];
  for (const s of doc.symbols.filter(o => ids.symbols.includes(o.id))) { xs.push(s.x); ys.push(s.y); }
  return { x: Math.min(...xs), y: Math.min(...ys) };
};
test('#1797 pasteOffset: centred on the mouse pointer, on the grid', () => {
  const doc = chain(), clip = copySchematic(doc, { symbols: ['S1', 'S2'], ports: ['P1', 'P2'] });
  // (the copy's box: x 120..540 and the gates' names above them; its centre then on the pointer)
  const o = pasteOffset(doc, clip, { at: { x: 1003, y: 706 }, area: { x: 0, y: 0, w: 1700, h: 1100 } });
  assert.ok(o.dx % 10 === 0 && o.dy % 10 === 0, JSON.stringify(o));
  const { ids } = pasteSchematic(doc, clip, o);
  const ps = doc.ports.filter(p => ids.ports.includes(p.id)).map(p => p.x);
  assert.equal((Math.min(...ps) + Math.max(...ps)) / 2 + 0, 330 + o.dx);
  assert.ok(Math.abs(330 + o.dx - 1003) <= 5, `centred on x: ${330 + o.dx}`);
});

test('#1797 pasteOffset: the mouse off the sheet: a blank place in view, nearest to its centre, clear of what is there', () => {
  const doc = chain(), clip = copySchematic(doc, { symbols: ['S1', 'S2'], ports: ['P1', 'P2'] });
  // the view: x 0..800, y 0..400; the chain at y 85..115 across 120..540
  const area = { x: 0, y: 0, w: 800, h: 400 };
  const o = pasteOffset(doc, clip, { area });
  const { ids } = pasteSchematic(doc, clip, o);
  const b = boxOf(doc, ids);
  // in view, not on the original (below it), as near the centre (400, 200) as a blank place is
  assert.ok(b.x >= 0 && b.x + 420 <= 800 && b.y >= 0 && b.y + 40 <= 400, JSON.stringify(b));
  assert.ok(o.dy > 0, 'below the original, which takes the top of the view');
  assert.deepEqual(errorsAndWarnings(doc), [], 'not touching it: no short, no warnings');
  // pasted again: another blank place, the two copies apart
  const o2 = pasteOffset(doc, clip, { area });
  assert.notDeepEqual(o2, o);
  const r2 = pasteSchematic(doc, clip, o2);
  assert.deepEqual(errorsAndWarnings(doc), [], 'the third chain clear of the two');
  assert.equal(r2.ids.symbols.length, 2);
});

test('#1797 pasteOffset: no blank place in view: centred in it; no view: 40 right and down; an empty clip: nothing', () => {
  const doc = chain(), clip = copySchematic(doc, { symbols: ['S1', 'S2'], ports: ['P1', 'P2'] });
  // a view that is all chain
  assert.deepEqual(pasteOffset(doc, clip, { area: { x: 100, y: 60, w: 460, h: 80 } }), { dx: 0, dy: 0 });
  assert.deepEqual(pasteOffset(doc, clip), { dx: 40, dy: 40 });
  assert.deepEqual(pasteOffset(doc, { symbols: [], wires: [], ports: [], labels: [] }, { area: { x: 0, y: 0, w: 800, h: 400 } }), { dx: 0, dy: 0 });
  // a view beyond the sheet's right edge: the copy kept on the sheet
  const far = pasteOffset(doc, clip, { area: { x: 1100, y: 0, w: 800, h: 400 } });
  assert.ok(120 + far.dx >= 1100 && 540 + far.dx <= 1700, JSON.stringify(far));
});
