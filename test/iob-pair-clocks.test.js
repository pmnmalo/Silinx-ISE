// #749: the two IOBs of a differential pair (DIFFM / DIFFS) share each clock wire of their I/O tile (IOIS_CLK0 ->
// ICLK10 / ICLK11, IOIS_CLK1 -> OTCLK10 / OTCLK11). Registers of one kind there on different clocks: ISE's map puts
// the DIFFM's on the IOB's second flip-flop (IFF2 / OFF2), clocked from the tile's second wire (IOIS_CLK4 -> ICLK20,
// IOIS_CLK5 -> OTCLK20), whatever the ports' order (ISE 14.7 on the Basys2-250, K14 / J12: input and output
// registers, both orders). The placer keeps I/Os without a LOC out of such a pair; LOC'd ones take the second
// flip-flop, routed on every device (before: "the routing did not converge"), its settings in the bit database (#759:
// measured on every DIFFM pad of the four devices): a complete bitstream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { pack } from '../packages/silinx-fpga/src/fpga/pack.js';
import { deviceSites, place, placedXdl, secondFlipFlops } from '../packages/silinx-fpga/src/fpga/place.js';
import { placeRoute } from '../packages/silinx-fpga/src/fpga/place-route.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { loadDb } from '../packages/silinx-fpga/src/fpga/bitdb-node.js';
import { knownRouting, frameData } from '../packages/silinx-fpga/src/fpga/bitgen.js';
import { instArcs } from '../packages/silinx-fpga/src/fpga/timing.js';
import { postParModels } from '../core/sim-model.js';
import { parseXdl, writeXdl } from '../packages/silinx-fpga/src/xdl.js';

const PARTS = ['xc3s100ecp132-4', 'xc3s250ecp132-4', 'xc3s500efg320-4', 'xc3s1200efg320-4'];

// two clocks, each from its own pad through an IBUFG and a BUFG (bits 4 and 7); registers r0 on the first, r1 on the
// second (or on the first too: oneClock): input registers (a0, a1 -> q0_o, q1_o through them) or output registers
function twoClocks({ oneClock = false } = {}) {
  const ports = { clk: { direction: 'input', bits: [2] }, clk2: { direction: 'input', bits: [5] } };
  const io = (I, O) => ({ port_directions: { I: 'input', O: 'output' }, connections: { I: [I], O: [O] } });
  const cells = { b0: { type: 'IBUFG', ...io(2, 3) }, g0: { type: 'BUFG', ...io(3, 4) }, b1: { type: 'IBUFG', ...io(5, 6) }, g1: { type: 'BUFG', ...io(6, 7) } };
  [0, 1].forEach(k => {
    ports[`a${k}`] = { direction: 'input', bits: [10 + k] };
    ports[`q${k}_o`] = { direction: 'output', bits: [20 + k] };
    cells[`a${k}_ibuf`] = { type: 'IBUF', ...io(10 + k, 12 + k) };
    cells[`r${k}`] = { type: 'FDRE', parameters: {}, attributes: {}, port_directions: { C: 'input', CE: 'input', R: 'input', D: 'input', Q: 'output' },
      connections: { C: [k && !oneClock ? 7 : 4], CE: ['1'], R: ['0'], D: [12 + k], Q: [14 + k] } };
    cells[`q${k}_obuf`] = { type: 'OBUF', ...io(14 + k, 20 + k) };
  });
  return readYosysJson({ modules: { t: { attributes: { top: 1 }, ports, cells, netnames: {} } } });
}
const devs = new Map();
const dev = part => devs.get(part) || devs.set(part, { graph: loadDeviceCache(part) }).get(part);
// the first pair of the device whose two pads can drive an output (DIFFM, DIFFS); with the bit database, one whose
// DIFFM has the second flip-flops' settings measured with the first (the DDR registers': not on every pad)
const pairOf = (sites, db = null) => {
  const byTile = new Map();
  for (const p of sites.pads.values()) if (p.pair && !p.inputOnly) byTile.set(p.pair, [...(byTile.get(p.pair) || []), p]);
  const [m, s] = [...byTile.values()].filter(ps => ps.length === 2).map(ps => ps.sort((a, b) => b.master - a.master))
    .find(([q]) => !db || ['R:IFF2:#FF', 'R:OFF2:#FF'].every(f => db.padFeats[q.name]?.[f]));
  return { m, s };
};
const iob = (design, name) => design.insts.find(i => i.name === name);
const cfgOf = i => i.cfg.filter(c => c.value !== '#OFF').map(c => `${c.attr}:${c.name ? `${c.name}:` : ''}${c.value}`);
const pinsOf = (design, name) => design.nets.flatMap(n => n.inpins.filter(p => p.inst === name).map(p => `${p.pin} ${n.name}`)).sort();

test('the pads of a differential pair: DIFFM / DIFFS share their tile\'s clock wires; the tile\'s third IOB has its own (every device)', () => {
  for (const part of PARTS) {
    const g = dev(part).graph, sites = deviceSites(g);
    let pairs = 0;
    for (const p of sites.pads.values()) {
      const w = ['ICLK1', 'ICLK2', 'OTCLK1', 'OTCLK2'].map(pin => g.sitePin(p.name, pin).wire);
      assert.deepEqual(w, ['ICLK1', 'ICLK2', 'OTCLK1', 'OTCLK2'].map(x => `${x}${p.pair ? (p.master ? 0 : 1) : 2}`), `${part} ${p.name}`);
      assert.equal(p.pair, /^DIFF[MS]/.test(p.type) ? p.tile : null);
      if (p.master) pairs++;
    }
    assert.ok(pairs > 30, `${part}: ${pairs}`);
  }
});

test('an IOB\'s registers on its second flip-flops: the settings and pins ISE\'s map writes (#749)', () => {
  const cfg = a => a.map(([attr, name, value]) => ({ attr, name, value }));
  // ISE's input register on IFF1 (J12) and on IFF2 (K14), and its output registers (in_loc, out2_loc)
  const inp = cfg([['ICLK1INV', '', 'ICLK1'], ['IDDRIN_MUX', '', '2'], ['IFD_DELAY_VALUE', '', 'DLY3'], ['IFF1', 'r_1', '#FF'], ['IFF1_INIT_ATTR', '', 'INIT0'],
    ['IFFDELMUX', '', '0'], ['IFFDMUX', '', '1'], ['IOATTRBOX', '', 'LVCMOS33'], ['PRE_DELAY_MUX', '', '0'], ['INBUF', 'sw_1_IBUF', ''], ['PAD', 'sw<1>', '']]);
  const i2 = secondFlipFlops(inp, ['I']);
  assert.deepEqual(cfgOf({ cfg: i2.cfg }), ['ICLK2INV:ICLK2', 'IDDRIN_MUX:2', 'IFD_DELAY_VALUE:DLY3', 'IFF2:r_1:#FF', 'IFF2_INIT_ATTR:INIT0', 'IFFDELMUX:0', 'IFFDMUX:1',
    'IOATTRBOX:LVCMOS33', 'PRE_DELAY_MUX:0', 'INBUF:sw_1_IBUF:', 'PAD:sw<1>:']);
  assert.deepEqual([...i2.pin], [['ICLK1', 'ICLK2'], ['IQ1', 'IQ2']]);
  const out = cfg([['DRIVEATTRBOX', '', '12'], ['IOATTRBOX', '', 'LVCMOS33'], ['O1INV', '', 'O1'], ['OMUX', '', 'OFF1'], ['SLEW', '', 'SLOW'], ['OFF1', 'q_1', '#FF'],
    ['OFF1_INIT_ATTR', '', 'INIT0'], ['OTCLK1INV', '', 'OTCLK1_B'], ['O1_DDRMUX', '', '1'], ['OUTBUF', 'led_1_OBUF', ''], ['PAD', 'led<1>', '']]);
  const o2 = secondFlipFlops(out, ['O']);
  assert.deepEqual(cfgOf({ cfg: o2.cfg }), ['DRIVEATTRBOX:12', 'IOATTRBOX:LVCMOS33', 'O2INV:O2', 'OMUX:OFF2', 'SLEW:SLOW', 'OFF2:q_1:#FF', 'OFF2_INIT_ATTR:INIT0',
    'OTCLK2INV:OTCLK2_B', 'O2_DDRMUX:1', 'OUTBUF:led_1_OBUF:', 'PAD:led<1>:']);
  assert.deepEqual([...o2.pin], [['O1', 'O2'], ['OTCLK1', 'OTCLK2']]);
  // an output-enable register with a direct output: only its part moves (the output stays on O1)
  const tri = cfg([['O1INV', '', 'O1'], ['OMUX', '', 'O1'], ['T1INV', '', 'T1_B'], ['TMUX', '', 'TFF1'], ['TFF1', 't', '#FF'], ['TFF1_INIT_ATTR', '', 'INIT1'],
    ['TFF1_SR_ATTR', '', 'SRHIGH'], ['OTCLK1INV', '', 'OTCLK1']]);
  const t2 = secondFlipFlops(tri, ['O']);
  assert.deepEqual(cfgOf({ cfg: t2.cfg }), ['O1INV:O1', 'OMUX:O1', 'T2INV:T2_B', 'TMUX:TFF2', 'TFF2:t:#FF', 'TFF2_INIT_ATTR:INIT1', 'TFF2_SR_ATTR:SRHIGH', 'OTCLK2INV:OTCLK2']);
  assert.deepEqual([...t2.pin], [['T1', 'T2'], ['OTCLK1', 'OTCLK2']]);
  // no register of that kind: unchanged
  assert.deepEqual(secondFlipFlops(out, ['I']), { cfg: out, pin: new Map() });
  // the static timing: IQ2 after the clock, O2 / T2 before it; no direct output path through O1
  assert.deepEqual([instArcs({ type: 'IBUF', cfg: i2.cfg }).clkToOut, instArcs({ type: 'IOB', cfg: o2.cfg }).setup, instArcs({ type: 'IOB', cfg: o2.cfg }).output], [[['IQ2', 0.6]], [['O2', 0.5]], []]);
  assert.deepEqual([instArcs({ type: 'IOB', cfg: t2.cfg }).setup, instArcs({ type: 'IOB', cfg: t2.cfg }).output.map(x => x[0])], [[['T2', 0.5]], ['O1']]);
});

test('the placer keeps two registers of one kind on different clocks out of one pair when their pads are free (#749, every device)', () => {
  for (const part of PARTS) {
    const sites = deviceSites(dev(part).graph), { m, s } = pairOf(sites);
    // the two registers' I/Os free, on three pads: the pair and one more (the farthest); the other I/Os LOC'd on the
    // pads nearest the pair (before, both registers often ended in the pair)
    const dist = q => Math.abs(q.px - m.px) + Math.abs(q.py - m.py);
    const rest = [...sites.pads.values()].filter(q => q !== m && q !== s && !q.inputOnly).sort((a, b) => dist(a) - dist(b) || (a.name < b.name ? -1 : 1));
    const near = rest.slice(0, 4), far = rest.at(-1);
    const few = { ...sites, pads: new Map([m, s, far, ...near].map(q => [q.name, q])) };
    for (const kind of ['i', 'o']) {
      const regPorts = kind === 'o' ? ['q0_o', 'q1_o'] : ['a0', 'a1'];
      const ucf = ['clk', 'clk2', ...(kind === 'o' ? ['a0', 'a1'] : ['q0_o', 'q1_o'])].map((n, k) => `NET "${n}" LOC = "${near[k].name}" ;`).join('\n');
      const inPair = oneClock => {
        const p = pack(twoClocks({ oneClock }), { part, iobRegs: kind, ucf });
        const regs = regPorts.map(n => p.insts.findIndex(x => x.name === n));
        assert.deepEqual(regs.map(k => p.insts[k].regs), [[kind.toUpperCase()], [kind.toUpperCase()]]);
        return Array.from({ length: 12 }, (_, seed) => {
          const r = place(p, few, { seed: seed + 1, effort: 0.1 });
          assert.deepEqual([r.ff2, r.warnings], [[], []]);
          return regs.filter(k => [m.name, s.name].includes(r.sites[k].site)).length;
        });
      };
      // on two clocks: one in the pair, every time; on one clock they may share it
      assert.deepEqual(inPair(false), Array(12).fill(1), `${part} ${kind}`);
      assert.ok(inPair(true).includes(2), `${part} ${kind}: one clock`);
    }
  }
});

for (const kind of ['o', 'i']) {
  test(`two LOC'd ${kind === 'o' ? 'output' : 'input'} registers on different clocks in one pair: the DIFFM's on its second flip-flop, both clocks routed, every setting in the bit database (#749, #759, every device)`, { timeout: 600000 }, () => {
    for (const part of PARTS) {
      const { graph } = dev(part), db = loadDb(part, { graph }), known = knownRouting(db);
      const { m, s } = pairOf(deviceSites(graph, known), db);
      // r1 (the second port, on clk2) on the DIFFM, r0 on the DIFFS; and the other way round
      for (const [p0, p1] of [[s, m], [m, s]]) {
        const port = k => (kind === 'o' ? `q${k}_o` : `a${k}`);
        const ucf = `NET "${port(0)}" LOC = "${p0.name}" ;\nNET "${port(1)}" LOC = "${p1.name}" ;\n`;
        const packed = pack(twoClocks(), { part, ucf, iobRegs: kind });
        assert.deepEqual(packed.warnings, []);
        const pr = placeRoute(packed, graph, known, { seed: 1, effort: 0.2 });
        assert.deepEqual([pr.routed.errors, pr.routed.failed, pr.routed.overused], [[], [], 0], `${part}: the routing converges`);
        const d = pr.routed.design, k1 = p1 === m ? 1 : 0, mp = port(k1), sp = port(1 - k1);
        const ckM = d.nets.find(x => x.outpins.some(q => q.inst === `g${k1}`)).name, ckS = d.nets.find(x => x.outpins.some(q => q.inst === `g${1 - k1}`)).name;
        const fm = kind === 'o' ? 'OFF' : 'IFF', clk = kind === 'o' ? 'OTCLK' : 'ICLK';
        // the DIFFM's register on the second flip-flop, the DIFFS's on the first
        assert.ok(cfgOf(iob(d, mp)).includes(`${fm}2:r${k1}:#FF`), cfgOf(iob(d, mp)).join(' '));
        assert.ok(cfgOf(iob(d, sp)).includes(`${fm}1:r${1 - k1}:#FF`), cfgOf(iob(d, sp)).join(' '));
        assert.ok(!cfgOf(iob(d, mp)).some(c => c.startsWith(`${fm}1`)));
        assert.ok(pinsOf(d, mp).includes(`${clk}2 ${ckM}`) && pinsOf(d, sp).includes(`${clk}1 ${ckS}`), `${pinsOf(d, mp)} / ${pinsOf(d, sp)}`);
        if (kind === 'o') assert.ok(pinsOf(d, mp).some(x => x.startsWith('O2 ')) && pinsOf(d, sp).some(x => x.startsWith('O1 ')));
        else assert.ok(d.nets.some(n => n.outpins.some(q => q.inst === mp && q.pin === 'IQ2')) && d.nets.some(n => n.outpins.some(q => q.inst === sp && q.pin === 'IQ1')));
        // both clocks into the tile: the DIFFM's from its second wire (IOIS_CLK4 / 5), the DIFFS's from the first
        const pips = d.nets.flatMap(n => n.pips.filter(x => x.tile === m.tile && /^IOIS_CLK\d$/.test(x.from)).map(x => `${n.name}: ${x.from} -> ${x.to}`)).sort();
        assert.deepEqual(pips, [`${ckM}: IOIS_CLK${kind === 'o' ? 5 : 4} -> ${clk}20`, `${ckS}: IOIS_CLK${kind === 'o' ? 1 : 0} -> ${clk}11`].sort());
        // the second flip-flop's settings on that pad alone in the bit database (#759; before, OMUX:OFF2, R:OFF1:#OFF…
        // were missing, with a warning)
        assert.deepEqual(pr.placement.warnings, []);
        assert.deepEqual(frameData(parseXdl(writeXdl(d)), db).unknown.map(u => `${u.tile} ${u.feature}`), [], part);
        // the post-place & route simulation model has both registers, the DIFFM's clocked by its second clock pin
        const model = postParModels(twoClocks(), d, { top: 't', part });
        assert.deepEqual(model.unknown, []);
        for (const r of ['r0', 'r1']) assert.match(model.vhdl, new RegExp(`^ {2}${r} : X_FF$`, 'm'));
      }
    }
  });
}

test('placedXdl: the instances and pins of the registers the placement puts on second flip-flops, nothing else (#749)', () => {
  const part = 'xc3s250ecp132-4', sites = deviceSites(dev(part).graph), { m, s } = pairOf(sites);
  const p = pack(twoClocks(), { part, iobRegs: 'o', ucf: `NET "q0_o" LOC = "${s.name}" ;\nNET "q1_o" LOC = "${m.name}" ;\n` });
  const r = place(p, sites, { seed: 1, effort: 0.1 });
  const k = p.insts.findIndex(x => x.name === 'q1_o');
  assert.deepEqual([r.ff2, r.warnings], [[{ inst: k, group: 'O' }], []]);
  const d = placedXdl(p, r), plain = placedXdl(p, { ...r, ff2: [] });
  assert.deepEqual(d.insts.filter((x, j) => JSON.stringify(x) !== JSON.stringify(plain.insts[j])).map(x => x.name), ['q1_o']);
  assert.deepEqual(pinsOf(d, 'q1_o').map(x => x.split(' ')[0]), ['O2', 'OTCLK2']);
  assert.deepEqual(pinsOf(plain, 'q1_o').map(x => x.split(' ')[0]), ['O1', 'OTCLK1']);
});
