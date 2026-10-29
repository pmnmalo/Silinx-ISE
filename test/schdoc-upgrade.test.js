// A schematic of version 3 brought to version 4 (core/schdoc-upgrade.js, #1136): its multiplexers 70 px wide, as the
// DEMUX, every connection kept. The schematics of before are drawn here from the multiplexer's geometry of before
// (written out below, not read from the code: 40 px for M2_1 / M4_1, 60 for M8_1, 80 for M16_1), turned and mirrored,
// with a wire from each pin outward; after the conversion, each pin is on its own wire's net, the HDL unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOC_VERSION, normalizeDoc, netlist, symbolDef, symbolPins, generateHdl } from '../core/schdoc.js';
import { copySchematic, pasteSchematic } from '../core/schclip.js';

const N = { mux2: 2, mux4: 4, mux8: 8, mux16: 16 };
// the multiplexer of before, its pins in local coordinates: { w, h, pins: [{ name, x, y, side }] }
function oldMux(type, en = false) {
  const n = N[type], k = Math.log2(n), bh = n * 20 + 20 + (en ? 20 : 0), h = bh + 10, bw = Math.max(40, 20 * k), cx = 20 + bw / 2;
  const pins = [...Array(n).keys()].map((i) => ({ name: `D${i}`, x: 0, y: 20 + 20 * i, side: 'W' }));
  if (en) pins.push({ name: 'E', x: 0, y: 20 + 20 * n, side: 'W' });
  for (let i = 0; i < k; i++) pins.push({ name: k === 1 ? 'S0' : `S${k - 1 - i}`, x: cx - 10 * (k - 1) + 20 * i, y: h, side: 'S' });
  pins.push({ name: 'O', x: bw + 40, y: bh / 2, side: 'E' });
  return { w: bw + 40, h, pins };
}
// (x, y) of a symbol: the top-left corner of its turned box; mirrored first, then turned clockwise
function place(sym, def, x, y) {
  let px = sym.mirror ? def.w - x : x, py = y;
  if (sym.rot === 90) [px, py] = [def.h - py, px];
  else if (sym.rot === 180) [px, py] = [def.w - px, def.h - py];
  else if (sym.rot === 270) [px, py] = [py, def.w - px];
  return { x: sym.x + px, y: sym.y + py };
}
const OUT = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
function turned(sym, side) {
  let [dx, dy] = OUT[side];
  if (sym.mirror) dx = -dx;
  if (sym.rot === 90) [dx, dy] = [-dy, dx]; else if (sym.rot === 180) [dx, dy] = [-dx, -dy]; else if (sym.rot === 270) [dx, dy] = [dy, -dx];
  return [dx, dy];
}
// a schematic of version 3: the multiplexer and a wire from each pin outward (40 px), each wire's far end an I/O marker
function before(type, rot, mirror, en = false) {
  const m = { id: 'M', type, x: 400, y: 300, rot, mirror, name: 'U1', params: { width: 1, en } };
  const def = oldMux(type, en);
  const wires = [], ports = [];
  for (const p of def.pins) {
    const a = place(m, def, p.x, p.y), [dx, dy] = turned(m, p.side), b = { x: a.x + 40 * dx, y: a.y + 40 * dy };
    wires.push({ id: `w_${p.name}`, points: [a, b] });
    ports.push({ id: `p_${p.name}`, name: `n_${p.name}`.toLowerCase(), dir: p.name === 'O' ? 'out' : 'in', width: 1, x: b.x, y: b.y });
  }
  return { version: 3, name: 'old', lang: 'vhdl', sheet: { w: 1700, h: 1100 }, symbols: [m], wires, labels: [], ports };
}
const ORIENTS = [0, 90, 180, 270].flatMap((rot) => [false, true].map((mirror) => [rot, mirror]));

test('#1136 a schematic of before: its multiplexers widened, turned and mirrored, every pin on its wire\'s net', () => {
  for (const type of Object.keys(N)) {
    for (const [rot, mirror] of ORIENTS) {
      for (const en of [false, true]) {
        const what = `${type}${en ? 'E' : ''} rot ${rot}${mirror ? ' mirrored' : ''}`;
        const old = before(type, rot, mirror, en), d = normalizeDoc(old);
        assert.equal(d.version, DOC_VERSION, what);
        const def = symbolDef(d.symbols[0]);
        assert.equal(def.body.w, type === 'mux16' ? 80 : 70, what);
        // the data, enable and select pins where they were; the output where its wire now ends
        const was = oldMux(type, en);
        for (const p of symbolPins(d.symbols[0], {}, def)) {
          const o = was.pins.find((q) => q.name === p.name);
          if (p.name !== 'O') assert.deepEqual([p.x, p.y], Object.values(place(old.symbols[0], was, o.x, o.y)), `${what}: ${p.name} kept`);
        }
        const nl = netlist(d);
        for (const p of was.pins) {
          const net = nl.pinNet.get(`M/${p.name}`);
          assert.ok(net, `${what}: ${p.name} connected`);
          assert.equal(net, nl.wireNet.get(`w_${p.name}`), `${what}: ${p.name} on its wire`);
          assert.equal(net, nl.portNet.get(`p_${p.name}`), `${what}: ${p.name} to its marker`);
        }
        assert.deepEqual(nl.diagnostics.filter((x) => x.severity !== 'info'), [], what);
        // converted once: a second normalization leaves it as it is
        assert.deepEqual(normalizeDoc(d), d, `${what}: once`);
      }
    }
  }
});

test('#1136 the output\'s connections moved with it: its marker on it, a run across it, a pin on it; a run shortened to nothing', () => {
  const m = { id: 'M', type: 'mux2', x: 100, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 8 } };
  // (before: O at (180, 130); after: (210, 130))
  const base = { version: 3, name: 'old', lang: 'vhdl', sheet: { w: 1700, h: 1100 }, labels: [] };
  // an I/O marker right on the output, and a net name there
  let d = normalizeDoc({ ...base, symbols: [m], wires: [], ports: [{ id: 'P', name: 'q', dir: 'out', width: 8, x: 180, y: 130 }], labels: [{ id: 'L', x: 180, y: 130, net: 'q' }] });
  assert.deepEqual([d.ports[0].x, d.ports[0].y, d.labels[0].x, d.labels[0].y], [210, 130, 210, 130]);
  { const nl = netlist(d); assert.equal(nl.pinNet.get('M/O'), nl.portNet.get('P')); }
  // a wire leaving it downwards: a run from there to the new output, a bus as the pin
  d = normalizeDoc({ ...base, symbols: [m], wires: [{ id: 'W1', points: [{ x: 180, y: 130 }, { x: 180, y: 200 }] }], ports: [{ id: 'P', name: 'q', dir: 'out', width: 8, x: 180, y: 200 }] });
  assert.deepEqual(d.wires.map((w) => [w.points.map((p) => `${p.x},${p.y}`).join(' '), !!w.bus]), [['180,130 180,200', false], ['180,130 210,130', true]]);
  { const nl = netlist(d); assert.equal(nl.pinNet.get('M/O'), nl.portNet.get('P')); }
  // another symbol's input right on it: joined by a run
  const buf = { id: 'B', type: 'buf', x: 180, y: 120, rot: 0, mirror: false, name: 'U2', params: { width: 8 } };
  d = normalizeDoc({ ...base, symbols: [m, buf], wires: [], ports: [] });
  assert.deepEqual(d.wires.map((w) => w.points.map((p) => `${p.x},${p.y}`).join(' ')), ['180,130 210,130']);
  { const nl = netlist(d); assert.equal(nl.pinNet.get('M/O'), nl.pinNet.get('B/I')); }
  // a wire of 30 px along the lead: the output now at its far end, the wire gone, the marker there on the output
  d = normalizeDoc({ ...base, symbols: [m], wires: [{ id: 'W1', points: [{ x: 180, y: 130 }, { x: 210, y: 130 }] }], ports: [{ id: 'P', name: 'q', dir: 'out', width: 8, x: 210, y: 130 }] });
  assert.deepEqual(d.wires, []);
  { const nl = netlist(d); assert.equal(nl.pinNet.get('M/O'), nl.portNet.get('P')); }
});

test('#1136 the HDL of a schematic of before the same after its conversion; a document of version 4 left as it is', () => {
  for (const [rot, mirror] of ORIENTS) {
    const old = before('mux4', rot, mirror), d = normalizeDoc(old);
    const hdl = generateHdl(d).code;
    assert.match(hdl, /O => n_o/, `rot ${rot}`);
    // the same HDL as the same design drawn now (the multiplexer of now, its wires to the same markers)
    const now = normalizeDoc(d);
    assert.equal(generateHdl(now).code, hdl);
  }
  const d4 = normalizeDoc({ version: 4, name: 'new', lang: 'vhdl', symbols: [{ id: 'M', type: 'mux2', x: 100, y: 100, rot: 90, mirror: true, params: {} }],
    wires: [{ id: 'W1', points: [{ x: 0, y: 0 }, { x: 0, y: 50 }] }], ports: [], labels: [] });
  assert.deepEqual([d4.symbols[0].x, d4.symbols[0].y, d4.wires[0].points], [100, 100, [{ x: 0, y: 0 }, { x: 0, y: 50 }]]);
});

test('#1136 a schematic of version 2 with a module not known yet: its multiplexers kept until it is converted with the modules', () => {
  const old = { ...before('mux2', 0, false), version: 2 };
  old.symbols.push({ id: 'X', type: 'module', x: 800, y: 100, rot: 0, mirror: false, name: 'U9', params: { module: 'sub' } });
  const d = normalizeDoc(old);
  assert.equal(d.version, 2);
  assert.deepEqual([d.symbols[0].x, d.wires.some((w) => w.points.some((p) => p.x === 480 && p.y === 330))], [400, true]);
  const modules = { sub: { name: 'sub', lang: 'vhdl', ports: [{ name: 'a', dir: 'in', width: 1 }] } };
  const c = normalizeDoc(d, { modules });
  assert.equal(c.version, DOC_VERSION);
  const nl = netlist(c, { modules });
  assert.equal(nl.pinNet.get('M/O'), nl.portNet.get('p_O'));
});

test('#1136 copy and paste: a multiplexer pasted as copied (the clipboard says its document version); one copied before widened', () => {
  const d = normalizeDoc(before('mux2', 90, false));
  const clip = copySchematic(d, { symbols: ['M'], wires: d.wires.map((w) => w.id), ports: d.ports.map((p) => p.id) });
  assert.equal(clip.docVersion, DOC_VERSION);
  const into = normalizeDoc({ version: DOC_VERSION, name: 'b', lang: 'vhdl', symbols: [], wires: [], ports: [], labels: [] });
  pasteSchematic(into, clip);
  assert.deepEqual(into.symbols.map((s) => [s.x, s.y]), d.symbols.map((s) => [s.x, s.y]));
  const nl = netlist(into);
  for (const p of ['D0', 'D1', 'S0', 'O']) assert.ok(nl.pinNet.get(`${into.symbols[0].id}/${p}`), p);
  // a clipboard of before (no docVersion): its multiplexer converted, its output's wire with it
  const oldClip = { version: 1, lang: 'vhdl', from: 'old', ...before('mux2', 0, false) };
  delete oldClip.name;
  const into2 = normalizeDoc({ version: DOC_VERSION, name: 'c', lang: 'vhdl', symbols: [], wires: [], ports: [], labels: [] });
  pasteSchematic(into2, oldClip);
  const n2 = netlist(into2), o = n2.pinNet.get(`${into2.symbols[0].id}/O`);
  assert.ok(o?.endpoints.some((e) => e.kind === 'port'));
});

// #1726: a schematic of version 4 brought to version 5: its bus taps drawn as ISE's, their input I a grid step from their
// output's line (local (0, 0); it was (0, 10), in line with O). The tap and its output stay; what met its old input
// follows: a bus wire coming along the move has its end moved, one coming across gets a bus wire to the new input.
test('#1726 a schematic of before: its bus taps\' inputs moved, turned and mirrored, every pin on its net, the HDL the same', () => {
  for (const [rot, mirror] of ORIENTS) {
    for (const along of [false, true]) {
      const tap = { id: 'T', type: 'slice', x: 400, y: 300, rot, mirror, name: 'U1', params: { msb: 2, lsb: 1 } };
      // the tap of before: I at (0, 10) and O at (40, 10) in its 40 x 20 box
      const old = { w: 40, h: 20 };
      const i = place(tap, old, 0, 10), o = place(tap, old, 40, 10), [dx, dy] = turned(tap, 'W'), [ex, ey] = turned(tap, 'E');
      // the bus to I: straight in along the lead, or (along) arriving across it, along the way the input moves
      const iNew = place(tap, old, 0, 0), mv = [Math.sign(iNew.x - i.x), Math.sign(iNew.y - i.y)];
      const far = along ? { x: i.x + 60 * mv[0], y: i.y + 60 * mv[1] } : { x: i.x + 40 * dx, y: i.y + 40 * dy };
      const oFar = { x: o.x + 40 * ex, y: o.y + 40 * ey };
      const d4 = { version: 4, name: 'taps', lang: 'vhdl', sheet: { w: 1700, h: 1100 }, symbols: [tap],
        wires: [{ id: 'WB', points: [far, i], bus: true }, { id: 'WO', points: [o, oFar], bus: true }], labels: [],
        ports: [{ id: 'PA', name: 'a', dir: 'in', width: 4, x: far.x, y: far.y }, { id: 'PY', name: 'y', dir: 'out', width: 2, x: oFar.x, y: oFar.y }] };
      const d = normalizeDoc(d4), where = `rot ${rot}${mirror ? ' mirrored' : ''}${along ? ', its bus along the move' : ''}`;
      assert.equal(d.version, DOC_VERSION);
      const pins = Object.fromEntries(symbolPins(d.symbols[0], {}).map((p) => [p.name, p]));
      assert.deepEqual([d.symbols[0].x, d.symbols[0].y, pins.O.x, pins.O.y], [400, 300, o.x, o.y], `${where}: the tap and its output stay`);
      assert.deepEqual([pins.I.x, pins.I.y], [iNew.x, iNew.y], where);
      const nl = netlist(d);
      assert.deepEqual(nl.diagnostics, [], where);
      assert.equal(nl.pinNet.get('T/I'), nl.portNet.get('PA'), `${where}: on its bus`);
      assert.equal(nl.pinNet.get('T/O'), nl.portNet.get('PY'), where);
      // along: the bus's end moved (no wire added); across: a bus wire from the old place to the new input
      assert.equal(d.wires.length, along ? 2 : 3, where);
      if (!along) assert.deepEqual(d.wires[2], { id: 'W3', points: [i, iNew], bus: true }, where);
      assert.match(generateHdl(d).code, /y <= a\(2 downto 1\);/, where);
      assert.deepEqual(normalizeDoc(d), d, `${where}: converted once`);
    }
  }
});

// #1910: a schematic of version 5 brought to version 6: its bus joins 60 px wide (they were 40, their output O at local
// (40, h/2)), their inputs' leads long enough for their bits' labels. Its inputs stay (the join placed so); its output moves
// along its lead, what met it following: a bus wire going on along the move has its end moved (a wire of no length
// left: dropped, its net name then on the pin), another symbol's pin there gets a bus wire to the new output.
test('#1910 a schematic of before: its bus joins widened, turned and mirrored, every pin on its net, the HDL the same', () => {
  for (const [rot, mirror] of ORIENTS) {
    for (const stub of [false, true]) {
      const join = { id: 'J', type: 'busjoin', x: 400, y: 300, rot, mirror, name: 'U1', params: { widths: '2,1' } };
      // the join of before: I0 at (0, 10), I1 at (0, 30), O at (40, 20) in its 40 x 40 box
      const old = { w: 40, h: 40 };
      const i0 = place(join, old, 0, 10), i1 = place(join, old, 0, 30), o = place(join, old, 40, 20);
      const [wx, wy] = turned(join, 'W'), [ex, ey] = turned(join, 'E');
      const far = (p, d, [dx, dy]) => ({ x: p.x + d * dx, y: p.y + d * dy });
      // the output: a bus wire on from it (stub: 20 px, as Beautify draws them, its net name at its end), a 3-bit port
      const oFar = far(o, stub ? 20 : 60, [ex, ey]);
      const d5 = { version: 5, name: 'joins', lang: 'vhdl', sheet: { w: 1700, h: 1100 }, symbols: [join],
        wires: [{ id: 'WA', points: [far(i0, 40, [wx, wy]), i0], bus: true }, { id: 'WB', points: [far(i1, 40, [wx, wy]), i1] },
          { id: 'WO', points: [o, oFar], bus: true }],
        labels: stub ? [{ id: 'LO', x: oFar.x, y: oFar.y, net: 'y' }] : [],
        ports: [{ id: 'PA', name: 'a', dir: 'in', width: 2, ...far(i0, 40, [wx, wy]) }, { id: 'PB', name: 'b', dir: 'in', width: 1, ...far(i1, 40, [wx, wy]) },
          { id: 'PY', name: 'y', dir: 'out', width: 3, ...far(o, 60, [ex, ey]) }] };
      if (stub) d5.ports[2] = { ...d5.ports[2], ...far(o, 100, [ex, ey]) }, d5.wires.push({ id: 'WY', points: [far(o, 100, [ex, ey]), oFar], bus: true });
      const d = normalizeDoc(d5), where = `rot ${rot}${mirror ? ' mirrored' : ''}${stub ? ', a 20 px stub on its output' : ''}`;
      assert.equal(d.version, DOC_VERSION);
      const pins = Object.fromEntries(symbolPins(d.symbols[0], {}).map((p) => [p.name, p]));
      const oNew = far(o, 20, [ex, ey]);
      assert.deepEqual([pins.I0, pins.I1].map((p) => `${p.x},${p.y}`), [`${i0.x},${i0.y}`, `${i1.x},${i1.y}`], `${where}: its inputs stay`);
      assert.deepEqual([pins.O.x, pins.O.y], [oNew.x, oNew.y], `${where}: its output 20 px further along its lead`);
      const nl = netlist(d);
      assert.deepEqual(nl.diagnostics, [], where);
      assert.equal(nl.pinNet.get('J/I0'), nl.portNet.get('PA'), where);
      assert.equal(nl.pinNet.get('J/I1'), nl.portNet.get('PB'), where);
      assert.equal(nl.pinNet.get('J/O'), nl.portNet.get('PY'), `${where}: its output on its net`);
      // the output's wire shortened (the stub: dropped, its net name now on the pin), no wire added
      assert.deepEqual(d.wires.map((w) => w.id), stub ? ['WA', 'WB', 'WY'] : ['WA', 'WB', 'WO'], where);
      if (!stub) assert.deepEqual(d.wires[2].points, [oNew, oFar], where);
      assert.match(generateHdl(d).code, /y <= a & b;/, where);
      assert.deepEqual(normalizeDoc(d), d, `${where}: converted once`);
    }
  }
  // another symbol's pin on the old output: a bus wire from there to the new one
  // (an INV of 2 bits, its input I on the join's old output, (440, 320))
  const inv = { id: 'G', type: 'inv', rot: 0, mirror: false, name: 'U2', params: { width: 2 } };
  const gI = symbolDef(inv).pins.find((p) => p.name === 'I');
  const d5 = { version: 5, name: 'joins', lang: 'vhdl', sheet: { w: 1700, h: 1100 }, wires: [], labels: [], ports: [],
    symbols: [{ id: 'J', type: 'busjoin', x: 400, y: 300, rot: 0, mirror: false, name: 'U1', params: { widths: '1,1' } },
      { ...inv, x: 440 - gI.x, y: 320 - gI.y }] };
  const d = normalizeDoc(d5);
  assert.deepEqual(d.wires, [{ id: 'W1', points: [{ x: 440, y: 320 }, { x: 460, y: 320 }], bus: true }]);
  const nl = netlist(d);
  assert.equal(nl.pinNet.get('J/O'), nl.pinNet.get('G/I'));
});

// #1988: a schematic of version 6 brought to version 7: INV, BUF and the tri-state buffers 80 px wide (they were 60, their
// outputs at local x = 60). Their inputs stay (each placed so); their outputs move 20 px along their leads, what met them
// following: a wire going on along the move has its end moved, a net name on the old lead moved with it.
test('#1988 a schematic of before: its inverters, buffers and BUFE4 widened, turned and mirrored, every pin on its net, the HDL the same', () => {
  const kinds = [['inv', {}, ['I'], ['O']], ['buf', {}, ['I'], ['O']], ['tbuf', { width: 4, bits: true, enable: 'E' }, ['E', 'I0', 'I1', 'I2', 'I3'], ['O0', 'O1', 'O2', 'O3']]];
  for (const [type, params, ins, outs] of kinds) {
    for (const [rot, mirror] of ORIENTS) {
      const sym = { id: 'G', type, x: 400, y: 300, rot, mirror, name: 'U1', params: { width: 1, ...params } };
      const def = symbolDef(sym), old = { w: 60, h: def.h };
      const at = (n, w) => { const p = def.pins.find((q) => q.name === n); return place(sym, w, p.x === 0 ? 0 : w.w, p.y); };
      const [wx, wy] = turned(sym, 'W'), [ex, ey] = turned(sym, 'E');
      const far = (p, d, [dx, dy]) => ({ x: p.x + d * dx, y: p.y + d * dy });
      const d6 = { version: 6, name: 'bufs', lang: 'vhdl', sheet: { w: 1700, h: 1100 }, symbols: [sym], wires: [], labels: [], ports: [] };
      for (const n of ins) {
        const p = at(n, old), q = far(p, 40, [wx, wy]);
        d6.ports.push({ id: `P${n}`, name: `i_${n}`.toLowerCase(), dir: 'in', width: 1, ...q });
        d6.wires.push({ id: `W${n}`, points: [q, p] });
      }
      for (const n of outs) {
        const p = at(n, old), q = far(p, 60, [ex, ey]);
        d6.ports.push({ id: `P${n}`, name: `o_${n}`.toLowerCase(), dir: 'out', width: 1, ...q });
        d6.wires.push({ id: `W${n}`, points: [p, q] });
        // a net name on the old lead, 10 px from the pin: moved with it
        d6.labels.push({ id: `L${n}`, ...far(p, 10, [ex, ey]), net: `o_${n}`.toLowerCase() });   // (the marker's own name: no warning)
      }
      const where = `${type} rot ${rot}${mirror ? ' mirrored' : ''}`;
      const d = normalizeDoc(structuredClone(d6));
      assert.equal(d.version, DOC_VERSION, where);
      const pins = Object.fromEntries(symbolPins(d.symbols[0], {}).map((p) => [p.name, p]));
      for (const n of ins) assert.deepEqual([pins[n].x, pins[n].y], [at(n, old).x, at(n, old).y], `${where}: ${n} stays`);
      for (const n of outs) {
        const o = at(n, old), oNew = far(o, 20, [ex, ey]);
        assert.deepEqual([pins[n].x, pins[n].y], [oNew.x, oNew.y], `${where}: ${n} 20 px further along its lead`);
        assert.deepEqual(d.wires.find((w) => w.id === `W${n}`).points, [oNew, far(o, 60, [ex, ey])], `${where}: ${n}'s wire shortened`);
        const l = d.labels.find((q) => q.id === `L${n}`);
        assert.deepEqual([l.x, l.y], [far(o, 30, [ex, ey]).x, far(o, 30, [ex, ey]).y], `${where}: ${n}'s net name moved with it`);
      }
      assert.equal(d.wires.length, d6.wires.length, `${where}: no wire added`);
      const nl = netlist(d);
      assert.deepEqual(nl.diagnostics.map((x) => x.message), [], `${where}: no warnings`);
      for (const n of [...ins, ...outs]) assert.equal(nl.pinNet.get(`G/${n}`), nl.portNet.get(`P${n}`), `${where}: ${n} on its net`);
      for (const lang of ['vhdl', 'verilog']) assert.equal(generateHdl(d, { lang }).code, generateHdl(normalizeDoc(structuredClone(d6)), { lang }).code, where);
      assert.deepEqual(normalizeDoc(structuredClone(d)), d, `${where}: converted once`);
    }
  }
  // another symbol's pin on the old output: a wire from there to the new one (an inverter's output on a buffer's input)
  const d6 = { version: 6, name: 'pair', lang: 'vhdl', sheet: { w: 1700, h: 1100 }, wires: [], labels: [], ports: [],
    symbols: [{ id: 'A', type: 'inv', x: 100, y: 90, rot: 0, mirror: false, name: 'U1', params: { width: 1 } },
      { id: 'B', type: 'buf', x: 160, y: 90, rot: 0, mirror: false, name: 'U2', params: { width: 1 } }] };
  const d = normalizeDoc(d6);
  assert.deepEqual(d.symbols.map((s) => [s.x, s.y]), [[100, 90], [160, 90]], 'each placed so that its input stays');
  assert.deepEqual(d.wires.map((w) => w.points), [[{ x: 160, y: 100 }, { x: 180, y: 100 }]]);
  const nl = netlist(d);
  assert.equal(nl.pinNet.get('A/O'), nl.pinNet.get('B/I'));
});
