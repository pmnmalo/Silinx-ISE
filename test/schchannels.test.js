// #1994: Rearrange Wires' channels (core/schchannels.js): the runs of the wires side by side between the symbols ordered
// with the fewest crossings, then spread at an even pitch. A small channel (two wires crossing twice, packed together):
// no crossing, the gaps even within a grid step, the ends, the bends and the nets the same; a net name with no wire
// under it never taken in by a run; a name on a run's neighbour kept on the wire; the selection's wires only; a second
// time, nothing to do. On the examples' schematics (every module converted, as Convert to Schematic draws it) and the
// schematic corpus: never more bends or crossings than Rearrange Wires without its channels, fewer uneven channels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile } from '../core/compile.js';
import * as sd from '../core/schdoc.js';
import { beautifyWires, wireStats } from '../core/schbeautify.js';
import { spreadChannels, channelStats } from '../core/schchannels.js';
import { convertModuleToSchematic } from '../core/hdl-to-sch.js';
import { loadItems } from './schematic-corpus/items.mjs';
import { example, EXAMPLES } from './examples-lib.mjs';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = g => elk.layout(g);

const P = (x, y) => ({ x, y });
const port = (id, name, dir, x, y) => ({ id, name, dir, width: 1, x, y });
const nets = doc => sd.netlist(doc).nets.map(n => `${n.name}: ${n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')}`).sort();
const xOf = (doc, id) => doc.wires.find(w => w.id === id).points[1].x;

// a -> y and b -> z, their vertical runs side by side at x = 200 and 210: a's run left of b's, they cross twice
function channel() {
  const doc = sd.newDoc('channel', 'vhdl');
  doc.ports.push(port('P1', 'a', 'in', 100, 100), port('P2', 'y', 'out', 500, 250), port('P3', 'b', 'in', 100, 200), port('P4', 'z', 'out', 500, 350));
  doc.wires.push({ id: 'W1', points: [P(100, 100), P(200, 100), P(200, 250), P(500, 250)] });
  doc.wires.push({ id: 'W2', points: [P(100, 200), P(210, 200), P(210, 350), P(500, 350)] });
  return sd.normalizeDoc(doc);
}

test('#1994 a channel: its runs ordered with no crossing, spread at an even pitch; the ends, the bends and the nets the same', () => {
  const doc = channel();
  const n0 = nets(doc), s0 = wireStats(doc);
  assert.deepEqual([s0.crossings, s0.bends], [2, 4]);
  assert.deepEqual(channelStats(doc), { channels: 1, runs: 2, uneven: 1, spread: 28 });
  assert.deepEqual(spreadChannels(doc).sort(), ['W1', 'W2']);
  // (the strip between the markers, 110 to 490: its walls at 100 and 500, the runs at 230 and 370: gaps of 13, 14, 13)
  assert.deepEqual([xOf(doc, 'W2'), xOf(doc, 'W1')], [230, 370]);
  assert.deepEqual(wireStats(doc), { bends: 4, crossings: 0, diagonals: 0, clashes: {} });
  assert.deepEqual(channelStats(doc), { channels: 1, runs: 2, uneven: 0, spread: 1 });
  assert.deepEqual(nets(doc), n0);
  assert.deepEqual(doc.wires.map(w => [w.points[0], w.points.at(-1)]), channel().wires.map(w => [w.points[0], w.points.at(-1)]));
  // a second time: nothing to do
  assert.deepEqual(spreadChannels(doc), []);
});

test('#1994 Rearrange Wires spreads the channel in the same edit, and a second Rearrange Wires leaves it', () => {
  const doc = channel();
  const r = beautifyWires(doc);
  assert.deepEqual(r.changed.sort(), ['W1', 'W2']);
  assert.deepEqual(wireStats(doc).crossings, 0);
  assert.equal(channelStats(doc).uneven, 0);
  assert.deepEqual(beautifyWires(doc).changed, []);
  // without its channels: the wires as the router leaves them
  const d2 = channel();
  beautifyWires(d2, { channels: false });
  assert.equal(channelStats(d2).uneven, 1);
});

test('#1994 a net name with no wire under it is never taken in by a run; a name on a run\'s neighbour stays on the wire', () => {
  // (a name lying on the sheet at 370,150, on no wire: a's run would pass over it there)
  const doc = channel();
  doc.labels.push({ id: 'L1', x: 370, y: 150, net: 'q' });
  const n0 = nets(doc);
  spreadChannels(doc);
  assert.notEqual(xOf(doc, 'W1'), 370);
  assert.deepEqual(nets(doc), n0, 'no net takes the name q');
  assert.ok(!doc.wires.some(w => w.points.some((p, i) => i && sd.onSeg({ x: 370, y: 150 }, w.points[i - 1], p))), 'no wire over the name');
  // a's name on its first segment at 180: its run stays right of it, the name on the wire
  const d2 = channel();
  d2.labels.push({ id: 'L1', x: 180, y: 100, net: 'a' });
  const m0 = nets(d2);
  spreadChannels(d2);
  assert.ok(xOf(d2, 'W1') > 180, `${xOf(d2, 'W1')}`);
  assert.deepEqual(nets(d2), m0);
});

test('#1994 only the selection\'s wires: a channel of one run is not a channel', () => {
  const doc = channel();
  assert.deepEqual(spreadChannels(doc, { only: new Set(['W1']) }), []);
  assert.deepEqual([xOf(doc, 'W1'), xOf(doc, 'W2')], [200, 210]);
  assert.deepEqual(beautifyWires(doc, { only: ['W1', 'W2'] }).changed.sort(), ['W1', 'W2']);
});

// the examples' schematics and the corpus's, rearranged with the channels and without
async function sheets() {
  const out = [];
  for (const it of loadItems(JSON.parse(fs.readFileSync(new URL('./schematic-corpus/manifest.json', import.meta.url), 'utf8')))) {
    out.push({ what: it.name, doc: it.doc, modules: Object.fromEntries((it.uses || []).map(u => [u.name, u.doc])) });
  }
  for (const name of EXAMPLES) {
    const ex = example(name);
    const lib = compile(ex.sources);
    const files = new Set(ex.sources.map(s => s.path));
    const modules = sd.modulesFromLibrary(lib, { sources: Object.fromEntries(ex.sources.map(s => [s.path, s.text])) });
    for (const m of [...lib.modules.values()].filter(m => files.has(m.archFile || m.file))) {
      out.push({ what: `${name}/${m.name}`, doc: (await convertModuleToSchematic({ sources: ex.sources, module: m.name, layout })).doc, modules });
    }
  }
  return out;
}

test('#1994 the examples\' and the corpus\'s schematics: never more bends or crossings than without the channels, far fewer uneven channels', { timeout: 300000 }, async () => {
  const T = { without: { uneven: 0, spread: 0, crossings: 0 }, with: { uneven: 0, spread: 0, crossings: 0 } };
  const list = await sheets();
  assert.ok(list.length >= 60, `${list.length} sheets`);
  for (const { what, doc, modules } of list) {
    const a = sd.normalizeDoc(structuredClone(doc), { modules }), b = sd.normalizeDoc(structuredClone(doc), { modules });
    beautifyWires(a, { modules, channels: false });
    beautifyWires(b, { modules });
    const sa = wireStats(a, { modules }), sb = wireStats(b, { modules }), ca = channelStats(a, { modules }), cb = channelStats(b, { modules });
    assert.ok(sb.bends <= sa.bends, `${what}: bends ${sa.bends} -> ${sb.bends}`);
    assert.ok(sb.crossings <= sa.crossings, `${what}: crossings ${sa.crossings} -> ${sb.crossings}`);
    assert.deepEqual(sb.clashes, sa.clashes, `${what}: the clashes`);
    assert.ok(cb.uneven <= ca.uneven, `${what}: uneven channels ${ca.uneven} -> ${cb.uneven}`);
    T.without.uneven += ca.uneven; T.without.spread += ca.spread; T.without.crossings += sa.crossings;
    T.with.uneven += cb.uneven; T.with.spread += cb.spread; T.with.crossings += sb.crossings;
  }
  // (measured: 44 uneven channels -> 9, their unevenness 995 -> 829 grid steps; the crossings 1513 -> 1513)
  assert.ok(T.with.uneven * 3 < T.without.uneven, JSON.stringify(T));
  assert.ok(T.with.spread < T.without.spread * 0.9, JSON.stringify(T));
});
