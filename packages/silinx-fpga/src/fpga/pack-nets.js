// Silinx toolchain - the packer's site pins of every connection (#405: out of packWith in core/fpga/pack.js): the nets
// of the packed design, the constants, the carry and shift-register chains between slices.
import { LUT_K, PackError } from './pack.js';

/** { outNets } of packWith. */
export function mountNets(ctx) {
  const {
    cells, extra, insts, macros, nets, setSink, sink, tapOf, uniqueNet, warnings, where
  } = ctx;

  // ---------------------------------------------------------------- site pins of every connection
  // the inputs of the LUTs in slices, by pin
  for (const s of insts) if (s.kind === 'slice') for (const side of ['F', 'G']) {
    const lut = s.lut[side];
    if (!lut) continue;
    lut.inputs.forEach((n, j) => {
      const pin = `${side}${lut.pins[j]}`;
      if (lut.cell >= 0 && j < LUT_K[cells[lut.cell].type]) setSink(lut.cell, `I${j}`, { inst: s.idx, pin, kind: 'gen' });
      else extra.push({ net: n, inst: s.idx, pin, kind: 'gen' });
    });
  }
  // the source pin of a cell's output for a connection of this kind
  const srcPin = (cell, kind, cellPin) => {
    const w = (kind === 'gen' && tapOf.get(cell)) || where.get(cell);
    const s = insts[w.inst];
    if (kind === 'f5') { s.f5out = true; return { inst: w.inst, pin: 'F5' }; }
    if (kind === 'fx') { s.fxout = true; return { inst: w.inst, pin: 'FX' }; }
    const sel = (X, v) => {
      if (s.out[X] && s.out[X] !== v) throw new PackError(`pack: output ${X} of a slice needed for two signals (${s.out[X]}, ${v})`);
      s.out[X] = v;
      s.used = s.used || {};
      s.used[X] = true;
      return { inst: w.inst, pin: X };
    };
    if (w.bel === 'SITE') {
      const o = w.outs[cellPin];
      if (!o) throw new PackError(`pack: ${cells[cell].type} ${cells[cell].name}: no site pin for ${cellPin}`);
      // a SLICEM memory's output through X / Y (F, G or the F5 multiplexer)
      if (s.kind === 'slice') return o === 'G' ? sel('Y', 'G') : sel('X', o);
      return { inst: w.inst, pin: o };
    }
    switch (w.bel) {
      case 'F': return sel('X', 'F');
      case 'G': return sel('Y', 'G');
      case 'FFX': return { inst: w.inst, pin: 'XQ' };
      case 'FFY': return { inst: w.inst, pin: 'YQ' };
      case 'F5MUX': return sel('X', 'F5');
      case 'F6MUX': return sel('Y', 'FX');
      case 'XORF': return sel('X', 'FXOR');
      case 'XORG': return sel('Y', 'GXOR');
      case 'CYMUXF': s.xb = true; return { inst: w.inst, pin: 'XB' };
      case 'CYMUXG': s.yb = true; return { inst: w.inst, pin: 'YB' };
      case 'INBUF': case 'IOBUF': return { inst: w.inst, pin: 'I' };
      case 'IFF1': return { inst: w.inst, pin: 'IQ1' };
      case 'BUFG': return { inst: w.inst, pin: 'O' };
      default: throw new PackError(`pack: no output pin for ${w.bel}`);
    }
  };
  const outNets = [];
  const netByKey = new Map();
  const constNet = v => {
    const k = `const${v}`;
    if (!netByKey.has(k)) { const n = { name: v ? 'GLOBAL_LOGIC1' : 'GLOBAL_LOGIC0', type: v ? 'vcc' : 'gnd', outpins: [], inpins: [] }; netByKey.set(k, n); outNets.push(n); }
    return netByKey.get(k);
  };
  const xdlNet = (n, from, kind) => {
    const k = `${n}|${kind}|${from.inst}`;
    if (!netByKey.has(k)) {
      const base = nets[n].name;
      const nn = { name: uniqueNet(kind === 'gen' ? base : `${base}_${kind.toUpperCase()}`), type: 'wire', outpins: [from], inpins: [] };
      netByKey.set(k, nn); outNets.push(nn);
    }
    return netByKey.get(k);
  };
  const connect = (n, to) => {
    if (nets[n].const !== undefined) { constNet(nets[n].const).inpins.push({ inst: to.inst, pin: to.pin }); return; }
    const d = nets[n].driver;
    if (!d) { warnings.push(`net ${nets[n].name} has no driver: ${insts[to.inst].name || to.inst}.${to.pin} tied to 0`); constNet(0).inpins.push({ inst: to.inst, pin: to.pin }); return; }
    if (to.kind === 'cy') { xdlNet(n, { inst: to.from, pin: 'COUT' }, 'cy').inpins.push({ inst: to.inst, pin: 'CIN' }); return; }
    xdlNet(n, srcPin(d.cell, to.kind, d.pin), to.kind).inpins.push({ inst: to.inst, pin: to.pin });
  };
  const seenPin = new Set();
  for (const [n, net] of nets.entries()) {
    for (const l of net.loads) {
      const v = sink.get(`${l.cell}:${l.pin}`);
      if (v === undefined) throw new PackError(`pack: ${cells[l.cell].type} ${cells[l.cell].name} pin ${l.pin}: not connected by the packer`);
      if (v === 'int') continue;
      const key = `${v.inst}:${v.pin}`;
      if (seenPin.has(key)) continue;   // several cell pins on one site pin (a shared BX, CLK…)
      seenPin.add(key);
      connect(n, v);
    }
  }
  for (const e of extra) { const key = `${e.inst}:${e.pin}`; if (!seenPin.has(key)) { seenPin.add(key); connect(e.net, e); } }
  // carry chains between slices: COUT of one slice -> CIN of the next
  for (const mac of macros) if (mac.kind === 'carry') for (let k = 1; k < mac.members.length; k++) {
    const a = insts[mac.members[k - 1].inst], b = insts[mac.members[k].inst];
    if (b.carry.init !== 'CIN') continue;
    const name = uniqueNet(`${a.carry.G?.mux?.name || a.carry.F?.mux?.name || 'carry'}_COUT`);
    outNets.push({ name, type: 'wire', outpins: [{ inst: a.idx, pin: 'COUT' }], inpins: [{ inst: b.idx, pin: 'CIN' }] });
  }
  // shift-register chains between the SLICEMs of a CLB: SHIFTOUT of the upper one -> SHIFTIN of the lower one
  for (const mac of macros) if (mac.kind === 'SRL') {
    outNets.push({ name: uniqueNet(nets[mac.net].name), type: 'wire', outpins: [{ inst: mac.members[1].inst, pin: 'SHIFTOUT' }], inpins: [{ inst: mac.members[0].inst, pin: 'SHIFTIN' }] });
  }

  return { outNets };
}
