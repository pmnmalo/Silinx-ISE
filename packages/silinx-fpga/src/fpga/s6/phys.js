// Silinx - the Spartan-6 physical design (#729; the plan: research/s6/README.md, #1): a netlist packed by
// core/fpga/s6/pack.js turned into the instances of sites the placer places and the nets of site pins the router
// routes (browser + Node).
//
// Each packed slice is a SLICEX / SLICEL / SLICEM instance; each I/O buffer an IOB (on the pad of its port's LOC),
// each BUFG / BUFGMUX a BUFGMUX, each block RAM and DSP48A1 its site. A net is the pin that drives it and the pins of
// its loads, the connections inside a slice left out: a LUT into its position's storage element, carry stage or
// wide multiplexer, the carry stage's sum or carry out into the position's storage element, the multiplexers' levels.
// The pins of a slice (UG384):
//   A1 … A6 (B1 … D6)  the position's LUT inputs: the inputs of its O6 LUT in their order on A1 …, the inputs of an
//                      O6 / O5 pair (5 at most, shared) on A1 … A5, A6 then tied high; the net a route-through passes
//                      (S's on O6, a 5FF's D on O5, #1143) after them;
//   AX … DX            the bypass inputs: a storage element's D, the carry's DI or CYINIT (AX), a wide
//                      multiplexer's select (AX, CX: F7AMUX, F7BMUX; BX: F8MUX);
//   CLK, CE, SR        the slice's control set; WE, AI … DI the SLICEM's shift registers' enable and data;
//   CIN, COUT          the carry chain, from the CARRY4 below, to the CARRY4 above (dedicated);
//   A … D (O6), AMUX … DMUX (the multiplexed output), AQ … DQ (the storage element)   the outputs.
// Constant inputs of a LUT are part of its function; other constant inputs (a bypass input, A6 of an O6 / O5
// pair, a block RAM's or a DSP's pins tied to 0 or 1, an output tied) are loads of the design's power nets, routed
// from the TIEOFF of a nearby switch box (the router, #730), as ISE routes them.
//
// physS6(nl, packed, { ucf }) -> {
//   insts: [{ name, kind: 'slice' | 'iob' | 'bufg' | 'bram' | 'dsp', type (the site type it needs: SLICEX / SLICEL /
//            SLICEM, IOB, BUFGMUX, RAMB8BWER, RAMB16BWER, DSP48A1), slice (index in packed.slices) | cell (its
//            cell), loc (an IOB: its pad, from the UCF) , dir, cons (the port's constraints) }]
//   nets:  [{ name, net (the netlist's) | null (a power net), power: 'vcc' | 'gnd' | null, clock (driven by a
//            global buffer), driver: { inst, pin } | null, loads: [{ inst, pin }] }]
//   chains: [[inst, bottom to top]]   the carry chains (each link a COUT -> CIN)
//   lutPins: [inst] -> { A: { o6: [site pin of each LUT input I0 …], o5: […] } … }   (slices)
//   conns:  [{ src, dst (cells), dstPin, srcInst, dstInst, internal (inside a slice) }]   every connection of
//            the netlist but the clocks', for the timing estimate (place-timing.js)
//   cellInst: [cell] -> inst (-1: a constant, a pull)
//   warnings: [] }
import { parseUcf, portAssignments } from '../../ucf.js';
import { ucfPortsOf } from '../pack.js';
import { AND2L, ffKind } from './pack.js';

export class PhysError extends Error {}

const POS = ['A', 'B', 'C', 'D'];
const LUT_TYPE = /^(LUT[1-6]|INV|BUF)$/;
const SRL = /^(SRL16E?|SRLC16E|SRLC32E)$/;
// the cells of sites of their own: site type, kind
const OWN = {
  IBUF: ['IOB', 'iob'], IBUFG: ['IOB', 'iob'], OBUF: ['IOB', 'iob'], OBUFT: ['IOB', 'iob'], IOBUF: ['IOB', 'iob'],
  BUFG: ['BUFGMUX', 'bufg'], BUFGMUX: ['BUFGMUX', 'bufg'],
  RAMB8BWER: ['RAMB8BWER', 'bram'], RAMB16BWER: ['RAMB16BWER', 'bram'], DSP48A1: ['DSP48A1', 'dsp'],
};
// cells with no site: constants, pulls (an IOB's setting)
const NO_SITE = /^(GND|VCC|PULLUP|PULLDOWN)$/;
// the pins of a hard block's cell as the site names them: A<3> -> A3
const sitePinOf = pin => pin.replace(/<(\d+)>$/, '$1');

/** The constraints of the port bits (LOC, IOSTANDARD, DRIVE, SLEW, PULL): { 'led<3>': { loc, iostandard … } }. */
function portConstraints(nl, ucf) {
  if (!ucf) return {};
  const parsed = typeof ucf === 'string' ? parseUcf(ucf, { ports: ucfPortsOf(nl) }) : ucf;
  return portAssignments(parsed?.assignments ? parsed : { assignments: ucf }, nl.ports.flatMap(p => p.bits.map(b => b.name))).assignments;
}

/** The physical design of a packed Spartan-6 netlist (see above). ucf: its text or parseUcf()'s result. */
export function physS6(nl, packed, { ucf = null } = {}) {
  const cells = nl.cells, nets = nl.nets;
  const cons = portConstraints(nl, ucf);
  const insts = [], warnings = [], errors = [];
  const lutPins = [];
  // constants: the netlist's 0 / 1 and the outputs of its GND / VCC cells
  const konst = new Map([[0, 0], [1, 1]]);
  cells.forEach(c => { if (c.type === 'GND' || c.type === 'VCC') for (const n of Object.values(c.pins)) konst.set(n, c.type === 'VCC' ? 1 : 0); });
  const isConst = n => konst.has(n);

  // ---- where each cell is: [inst, role, position]
  const role = new Map();
  const used = new Set();
  const names = new Set();
  const uniq = base => { let n = base, k = 1; while (names.has(n)) n = `${base}_${k++}`; names.add(n); return n; };
  packed.slices.forEach((s, si) => {
    const inst = insts.length;
    const at = (c, r, p) => { if (typeof c === 'number') { role.set(c, { inst, r, p }); used.add(c); } };
    for (const p of POS) {
      const q = s.pos[p];
      if (typeof q.o6 === 'number') {
        const c = cells[q.o6];
        if (!LUT_TYPE.test(c.type) && !SRL.test(c.type)) errors.push(`${c.name} (${c.type}): the SLICEM's distributed RAMs are not placed yet (#729)`);
        else if (role.has(q.o6)) errors.push(`${c.name}: a cell in two positions of a slice`);
      }
      at(q.o6, 'o6', p); at(q.o5, 'o5', p); at(q.ff, 'ff', p); at(q.ff5, 'ff5', p);
    }
    at(s.carry, 'carry', null); at(s.f7.A, 'f7', 'A'); at(s.f7.B, 'f7', 'C'); at(s.f8, 'f8', 'B');
    const named = [...POS.map(p => s.pos[p].ff), ...POS.map(p => s.pos[p].o6), s.carry].find(c => typeof c === 'number');
    insts.push({ name: uniq(named !== undefined ? cells[named].name : `slice${si}`), kind: 'slice', type: `SLICE${s.kind}`, slice: si });
  });
  const portOf = new Map();
  for (const p of nl.ports) for (const b of p.bits) portOf.set(b.net, b.name);
  cells.forEach((c, ci) => {
    if (used.has(ci) || NO_SITE.test(c.type)) return;
    const own = OWN[c.type];
    if (!own) { errors.push(`${c.name} (${c.type}): the Spartan-6 placer has no site for it yet (#729)`); return; }
    const inst = insts.length;
    role.set(ci, { inst, r: own[1], p: null });
    if (own[1] === 'iob') {
      const pad = c.type === 'IOBUF' ? c.pins.IO : /^OBUF/.test(c.type) ? c.pins.O : c.pins.I;
      const port = portOf.get(pad);
      if (port === undefined) { errors.push(`${c.name}: an I/O buffer not on a port of the top`); return; }
      const a = cons[port] || {};
      const dir = c.type === 'IOBUF' ? 'inout' : /^OBUF/.test(c.type) ? 'out' : 'in';
      insts.push({ name: uniq(port), kind: 'iob', type: 'IOB', cell: ci, port, dir, loc: a.loc ? String(a.loc).toUpperCase() : null, cons: a });
    } else insts.push({ name: uniq(c.name), kind: own[1], type: own[0], cell: ci });
  });

  // ---- the site pin of every cell pin outside its slice (null: inside it, or a constant set by the slice)
  const slicePacked = inst => packed.slices[insts[inst].slice];
  const outDriver = new Map();   // net -> the cell output that drives it: { ci, pin }
  cells.forEach((c, ci) => { for (const [pin, n] of Object.entries(c.pins)) if (c.dirs[pin.replace(/<\d+>$/, '')] === 'output' && n > 1) outDriver.set(n, { ci, pin }); });
  // the source of a net inside slice `inst`: { p, how } ('o6', 'o5', 'xor', 'cy', 'f7', 'f8') or null
  const localSource = (inst, n) => {
    const d = outDriver.get(n), r = d && role.get(d.ci);
    if (!r || r.inst !== inst) return null;
    if (r.r === 'carry') { const m = /^(O|CO)<(\d)>$/.exec(d.pin); return { p: POS[+m[2]], how: m[1] === 'O' ? 'xor' : 'cy' }; }
    if (r.r === 'o6' || r.r === 'o5' || r.r === 'f7' || r.r === 'f8') return { p: r.p, how: r.r };
    return null;
  };
  const internal = (ci, pin, n) => {
    const r = role.get(ci);
    if (!r || insts[r.inst].kind !== 'slice') return false;
    const src = localSource(r.inst, n);
    if (!src) return false;
    if (r.r === 'ff') return pin === 'D' && src.p === r.p;
    if (r.r === 'ff5') return pin === 'D' && src.p === r.p && src.how === 'o5';
    if (r.r === 'carry') {
      const m = /^(S|DI)<(\d)>$/.exec(pin);
      return !!m && src.p === POS[+m[2]] && src.how === (m[1] === 'S' ? 'o6' : 'o5');
    }
    if (r.r === 'f7') return (pin === 'I0' || pin === 'I1') && src.how === 'o6' && src.p === (pin === 'I0' ? r.p : POS[POS.indexOf(r.p) + 1]);
    if (r.r === 'f8') return (pin === 'I0' || pin === 'I1') && src.how === 'f7';
    return false;
  };

  // the LUT inputs of each position on A1 …: an O6 alone in their order, an O6 / O5 pair shared (A6 high)
  // (an INV / BUF: its input I)
  const lutInputNets = c => Object.entries(c.pins).filter(([p]) => /^I\d?$/.test(p)).sort().map(([, n]) => n);
  const vccA6 = [], constX = [];   // [inst, pin], [inst, pin, value]
  packed.slices.forEach((s, si) => {
    const inst = si, map = {};
    for (const p of POS) {
      const q = s.pos[p];
      const o6 = typeof q.o6 === 'number' && LUT_TYPE.test(cells[q.o6].type) ? q.o6 : null;
      const o5 = typeof q.o5 === 'number' ? q.o5 : null;
      // (a route-through, 'thru:<net>': the LUT passes one net, of S on O6, of a 5FF's D on O5)
      const thruOf = x => (typeof x === 'string' && x.startsWith('thru:') ? +x.slice(5) : null);
      const t6 = thruOf(q.o6), t5 = thruOf(q.o5);
      const order = [];
      for (const c of [o6, o5]) if (c !== null) for (const n of lutInputNets(cells[c])) if (!isConst(n) && !order.includes(n)) order.push(n);
      for (const n of [t6, t5]) if (n !== null && !order.includes(n)) order.push(n);
      if ((o5 !== null || t5 !== null) && order.length > 5) errors.push(`${insts[inst].name}: the LUTs of position ${p} share more than 5 inputs`);
      if (order.length > 6) errors.push(`${insts[inst].name}: position ${p} has ${order.length} LUT inputs`);
      const pinOfNet = n => (isConst(n) ? null : `${p}${order.indexOf(n) + 1}`);
      map[p] = { order, o6: o6 !== null ? lutInputNets(cells[o6]).map(pinOfNet) : null, o5: o5 !== null ? lutInputNets(cells[o5]).map(pinOfNet) : null,
        o6thru: t6 !== null ? pinOfNet(t6) : null, o5thru: t5 !== null ? pinOfNet(t5) : null };
      const di = s.carry !== null ? cells[s.carry].pins[`DI<${POS.indexOf(p)}>`] ?? 0 : null;
      const thru = t6 !== null && di === t6;
      // a constant DI: O5's (A6 high), or the bypass input's when the O6 LUT takes all six inputs
      if (di !== null && isConst(di) && q.o5 === null) map[p].diConst = order.length > 5 ? 'x' : 'o5';
      if (o5 !== null || t5 !== null || thru || map[p].diConst === 'o5') vccA6.push([inst, `${p}6`]);
      if (map[p].diConst === 'x') constX.push([inst, `${p}X`, konst.get(di)]);
      if (thru) map[p].diThru = true;
    }
    lutPins[inst] = map;
  });

  const ctrlPin = { C: 'CLK', G: 'CLK', CE: 'CE', GE: 'CE', R: 'SR', S: 'SR', CLR: 'SR', PRE: 'SR' };
  // the site pin of an input pin of a cell (null: none); n its net
  const inPin = (ci, pin, n) => {
    const r = role.get(ci), c = cells[ci];
    if (!r) return null;
    const inst = insts[r.inst];
    if (inst.kind !== 'slice') {
      if (inst.kind === 'iob') return { I: c.type === 'IOBUF' ? 'O' : 'O', T: 'T' }[pin] ?? null;
      if (inst.kind === 'bufg') return pin === 'I' ? 'I0' : pin === 'I0' || pin === 'I1' || pin === 'S' ? pin : null;
      return sitePinOf(pin);
    }
    if (internal(ci, pin, n)) return null;
    const s = slicePacked(r.inst);
    switch (r.r) {
      case 'o6': case 'o5': {
        if (SRL.test(c.type)) {
          if (pin === 'D') return `${r.p}I`;
          if (pin === 'CLK') return 'CLK';
          if (pin === 'CE') return isConst(n) && konst.get(n) === 1 ? null : 'WE';
          const m = /^A(?:<(\d)>|(\d))$/.exec(pin);
          return m ? `${r.p}${+(m[1] ?? m[2]) + 2}` : null;
        }
        if (isConst(n)) return null;
        const k = +(/^I(\d?)$/.exec(pin)[1] || 0);
        return lutPins[r.inst][r.p][r.r][k];
      }
      case 'ff': case 'ff5': {
        const kind = ffKind(c.type);
        if (pin === 'D') return r.r === 'ff5' && s.pos[r.p].o5 === `thru:${n}` ? lutPins[r.inst][r.p].o5thru : `${r.p}X`;
        const cp = ctrlPin[pin];
        if (cp === 'CE' && konst.get(n) === 1) return null;
        if (cp === 'SR' && (konst.get(n) === 0 || !kind.sr)) return null;
        if (cp === 'CLK' && isConst(n)) return null;
        return cp ?? null;
      }
      case 'carry': {
        let m;
        // (DI the net S takes through the position's LUT: O5 passes it too, as map packs it, A6 high)
        if ((m = /^DI<(\d)>$/.exec(pin))) return isConst(n) || s.pos[POS[+m[1]]].o6 === `thru:${n}` ? null : `${POS[+m[1]]}X`;
        if ((m = /^S<(\d)>$/.exec(pin))) return isConst(n) ? null : s.pos[POS[+m[1]]].o6 === `thru:${n}` ? lutPins[r.inst][POS[+m[1]]].o6thru : null;
        if (pin === 'CYINIT') return isConst(n) ? null : 'AX';
        if (pin === 'CI') {
          if (isConst(n)) return null;
          const d = outDriver.get(n);
          if (d && cells[d.ci].type === 'CARRY4' && d.pin === 'CO<3>') return 'CIN';
          errors.push(`${c.name}: its carry in comes from ${d ? cells[d.ci].name : 'no cell'}, not from a carry chain`);
          return null;
        }
        return null;
      }
      case 'f7': return pin === 'S' ? (isConst(n) ? null : r.p === 'A' ? 'AX' : 'CX') : null;
      case 'f8': return pin === 'S' ? (isConst(n) ? null : 'BX') : null;
      default: return null;
    }
  };
  // the site pin of an output pin of a cell
  const outPin = (ci, pin, n) => {
    const r = role.get(ci), c = cells[ci];
    if (!r) return null;
    const inst = insts[r.inst];
    if (inst.kind === 'iob') return pin === 'O' && c.type !== 'OBUF' && c.type !== 'OBUFT' ? 'I' : null;
    if (inst.kind === 'bufg') return pin === 'O' ? 'O' : null;
    if (inst.kind !== 'slice') return sitePinOf(pin);
    const s = slicePacked(r.inst);
    switch (r.r) {
      case 'o6': return SRL.test(c.type) && pin === 'Q31' ? `${r.p}MUX` : r.p;
      case 'o5': case 'ff5': return `${r.p}MUX`;
      case 'ff': return `${r.p}Q`;
      case 'f7': return `${r.p}MUX`;
      case 'f8': return 'BMUX';
      case 'carry': {
        const m = /^(O|CO)<(\d)>$/.exec(pin), p = POS[+m[2]];
        if (m[1] === 'O') return s.pos[p].ff === AND2L ? `${p}Q` : `${p}MUX`;
        if (+m[2] < 3) return `${p}MUX`;
        return nets[n].loads.some(l => cells[l.cell].type === 'CARRY4' && l.pin === 'CI') ? 'COUT' : 'DMUX';
      }
      default: return null;
    }
  };

  // ---- the nets
  const out = [], conns = [];
  const power = { vcc: { name: 'GLOBAL_LOGIC1', net: null, power: 'vcc', clock: false, driver: null, loads: [] },
    gnd: { name: 'GLOBAL_LOGIC0', net: null, power: 'gnd', clock: false, driver: null, loads: [] } };
  const addLoad = (net, inst, pin) => { const k = `${inst}:${pin}`; if (!(net.keys ||= new Set()).has(k)) { net.keys.add(k); net.loads.push({ inst, pin }); } };
  const netNames = new Set(['GLOBAL_LOGIC1', 'GLOBAL_LOGIC0']);
  const netName = n => { let b = nets[n].port || nets[n].name || `net${n}`, k = 1, nm = b; while (netNames.has(nm)) nm = `${b}_${k++}`; netNames.add(nm); return nm; };
  for (let n = 2; n < nets.length; n++) {
    if (isConst(n)) continue;
    const d = outDriver.get(n);
    if (!d || !role.has(d.ci)) continue;
    const net = { name: null, net: n, power: null, clock: insts[role.get(d.ci).inst].kind === 'bufg', driver: null, loads: [] };
    for (const l of nets[n].loads) {
      if (!role.has(l.cell)) continue;
      const pin = inPin(l.cell, l.pin, n);
      if (pin !== null) addLoad(net, role.get(l.cell).inst, pin);
      // (the connections of the timing estimate: the clocks' left out)
      if (!net.clock) conns.push({ src: d.ci, dst: l.cell, dstPin: l.pin, srcInst: role.get(d.ci).inst, dstInst: role.get(l.cell).inst, internal: pin === null });
    }
    if (!net.loads.length) continue;
    const pin = outPin(d.ci, d.pin, n);
    if (pin === null) { errors.push(`${cells[d.ci].name}: its output ${d.pin} has no way out of its site`); continue; }
    net.name = netName(n);
    net.driver = { inst: role.get(d.ci).inst, pin };
    out.push(net);
  }
  // the constant inputs that are pins: the bypass inputs, A6 of the O6 / O5 pairs, the hard blocks', the IOBs'
  for (const [ci, r] of role) {
    const c = cells[ci], kind = insts[r.inst].kind;
    for (const [pin, n] of Object.entries(c.pins)) {
      if (!isConst(n) || c.dirs[pin.replace(/<\d+>$/, '')] === 'output') continue;
      let sp = null;
      if (kind === 'slice') {
        if ((r.r === 'ff' || r.r === 'ff5') && pin === 'D') sp = `${r.p}X`;
        else if ((r.r === 'ff' || r.r === 'ff5') && ctrlPin[pin] === 'CE' && konst.get(n) === 0) sp = 'CE';
        else if ((r.r === 'ff' || r.r === 'ff5') && ctrlPin[pin] === 'SR' && konst.get(n) === 1 && ffKind(c.type).sr) sp = 'SR';
      } else if (kind === 'iob') sp = pin === 'I' ? 'O' : null;
      else if (kind === 'bram' || kind === 'dsp') sp = sitePinOf(pin);
      if (sp) addLoad(power[konst.get(n) ? 'vcc' : 'gnd'], r.inst, sp);
    }
  }
  for (const [inst, pin] of vccA6) addLoad(power.vcc, inst, pin);
  for (const [inst, pin, v] of constX) addLoad(power[v ? 'vcc' : 'gnd'], inst, pin);
  // a storage element as a gate (AND2L): its slice's clock and clock enable high, its set / reset low (as map's)
  packed.slices.forEach((s, si) => { if (s.ctrl === AND2L) { addLoad(power.vcc, si, 'CLK'); addLoad(power.vcc, si, 'CE'); addLoad(power.gnd, si, 'SR'); } });
  for (const p of [power.vcc, power.gnd]) if (p.loads.length) out.push(p);

  // ---- one net per site pin
  const pinNet = new Map();
  for (const net of out) {
    for (const e of [net.driver, ...net.loads]) {
      if (!e) continue;
      const k = `${e.inst}:${e.pin}`;
      if (pinNet.has(k) && pinNet.get(k) !== net.name) errors.push(`${insts[e.inst].name}: its pin ${e.pin} carries ${pinNet.get(k)} and ${net.name}`);
      pinNet.set(k, net.name);
    }
  }
  if (errors.length) throw new PhysError(`the Spartan-6 design cannot be placed: ${[...new Set(errors)].join('; ')}`);
  for (const net of out) delete net.keys;
  const cellInst = Int32Array.from(cells, (c, ci) => (role.has(ci) ? role.get(ci).inst : -1));
  return { insts, nets: out, chains: packed.chains.map(ch => ch.slice()), lutPins, conns, cellInst, warnings };
}
