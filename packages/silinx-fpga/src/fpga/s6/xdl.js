// Silinx - the placed Spartan-6 design as XDL (#729): what ISE's `xdl -xdl2ncd` reads and `par -k` routes, and the
// router (#730) takes (browser + Node). The configuration of each site is written as ISE's xdl -ncd2xdl writes it
// (the elements and values of the device report's primitive definitions of SLICEX / SLICEL / SLICEM, IOB, BUFG,
// RAMB8BWER / RAMB16BWER, DSP48A1).
//
//   placedXdlS6(nl, packed, phys, placement, { part, name, device }) -> a design for writeXdl (core/xdl.js); with the
//     device (its routing graph) each power net is split into one net a TIEOFF, the one each pin is tied from, its
//     source an XDL_DUMMY instance of the TIEOFF (as ISE; xdl -xdl2ncd refuses a power net with no source)
//   lutEquation(init bits, inputs) -> 'O6' / 'O5' equation of XDL ('(A1*~A2)+…', '0', '1')
import { paramBits, paramInt } from '../netlist.js';
import { AND2L, ffKind } from './pack.js';
import { tieoffFor } from './tieoffs.js';

class XdlError extends Error {}

const POS = ['A', 'B', 'C', 'D'];

/**
 * The equation of a LUT for XDL: init (its INIT bits, least significant first: the output for the inputs I0 … as
 * a binary number), inputs[k]: the site pin of input k ('A3') or its constant (0 / 1). The sum of the input
 * combinations that give 1, or the complement of those that give 0 (whichever is shorter).
 */
export function lutEquation(init, inputs) {
  const vars = [...new Set(inputs.filter(x => typeof x === 'string'))].sort();
  const n = vars.length, ones = [], zeros = [];
  for (let v = 0; v < 1 << n; v++) {
    let idx = 0;
    inputs.forEach((x, k) => { const b = typeof x === 'string' ? (v >> vars.indexOf(x)) & 1 : x ? 1 : 0; idx |= b << k; });
    (init[idx] ? ones : zeros).push(v);
  }
  if (!zeros.length) return '1';
  if (!ones.length) return '0';
  const term = v => `(${vars.map((x, i) => ((v >> i) & 1 ? x : `~${x}`)).join('*')})`;
  return ones.length <= zeros.length ? ones.map(term).join('+') : `~(${zeros.map(term).join('+')})`;
}

// the INIT of a LUT cell (INV and BUF: their one input)
function lutInit(c) {
  if (c.type === 'INV') return [1, 0];
  if (c.type === 'BUF') return [0, 1];
  const k = +/^LUT(\d)$/.exec(c.type)[1];
  const b = paramBits(c.params.INIT) || [];
  return Array.from({ length: 1 << k }, (_, i) => b[i] || 0);
}
const eqPin = pin => `A${pin.slice(1)}`;
// a parameter's bits as hex digits, most significant first (INIT_00 … of a block RAM: 64 digits)
const hexOf = (v, bits) => {
  const b = paramBits(v) || [];
  let s = '';
  for (let i = Math.ceil(bits / 4) - 1; i >= 0; i--) s += ((b[4 * i] || 0) | (b[4 * i + 1] || 0) << 1 | (b[4 * i + 2] || 0) << 2 | (b[4 * i + 3] || 0) << 3).toString(16).toUpperCase();
  return s;
};
const strOf = v => String(v ?? '').replace(/^"|"$/g, '');

/** The placed design as XDL (see above). placement: placeS6's result. */
export function placedXdlS6(nl, packed, phys, placement, { part, name = 'top', device = null } = {}) {
  const cells = nl.cells, { insts } = phys;
  const netByNl = new Map(phys.nets.filter(n => n.net !== null).map(n => [n.net, n]));
  const netNameOf = n => netByNl.get(n)?.name ?? nl.nets[n]?.name ?? `net${n}`;
  const konst = n => (n === 0 || n === 1 ? n : null);
  // the pins each instance drives and takes
  const drives = insts.map(() => new Set()), takes = insts.map(() => new Set());
  const a6High = new Set(phys.nets.filter(n => n.power === 'vcc').flatMap(n => n.loads.filter(l => /^[A-D]6$/.test(l.pin)).map(l => `${l.inst}:${l.pin[0]}`)));
  for (const net of phys.nets) { if (net.driver) drives[net.driver.inst].add(net.driver.pin); for (const l of net.loads) takes[l.inst].add(l.pin); }
  const out = [];
  insts.forEach((inst, i) => {
    const cfg = [];
    const put = (attr, nm, value) => cfg.push({ attr, name: nm ?? '', value: value ?? '' });
    if (inst.kind === 'slice') sliceCfg(i, packed.slices[inst.slice], put);
    else if (inst.kind === 'iob') iobCfg(inst, put);
    else if (inst.kind === 'bufg') put('BUFG', cells[inst.cell].name, '');
    else if (inst.kind === 'bram') bramCfg(cells[inst.cell], inst.type, put);
    else if (inst.kind === 'dsp') dspCfg(cells[inst.cell], put);
    const type = inst.kind === 'bufg' ? 'BUFG' : inst.type;
    out.push({ name: inst.name, type, placed: true, tile: placement.tile[i], site: placement.site[i], cfg });
  });

  function sliceCfg(i, s, put) {
    const lp = phys.lutPins[i], name = insts[i].name;
    // a position whose A6 is tied high (an O6 / O5 pair, an O5 route-through): its O6 names A6, as ISE writes it
    // ((A6+~A6)*(…), an unused O6 too), or the pin tied is not used inside the slice (PhysDesignRules:1709)
    const high = (p, eq) => (a6High.has(`${i}:${p}`) ? `(A6+~A6)*(${eq})` : eq);
    const carry = s.carry !== null ? cells[s.carry] : null;
    const ff = POS.map(p => s.pos[p].ff).find(c => typeof c === 'number') ?? POS.map(p => s.pos[p].ff5).find(c => typeof c === 'number');
    const kind = ff !== undefined ? ffKind(cells[ff].type) : null;
    POS.forEach((p, k) => {
      const q = s.pos[p], m = lp[p];
      // the LUTs
      if (typeof q.o6 === 'number') {
        const c = cells[q.o6];
        if (!/^(LUT\d|INV|BUF)$/.test(c.type)) throw new XdlError(`${c.name} (${c.type}): the SLICEM's shift registers and RAMs are not written as XDL yet (#729)`);
        put(`${p}6LUT`, c.name, `#LUT:O6=${high(p, lutEquation(lutInit(c), lutInputsOf(c, m.o6)))}`);
      } else if (typeof q.o6 === 'string' && q.o6.startsWith('thru:')) put(`${p}6LUT`, `${netNameOf(+q.o6.slice(5))}_rt`, `#LUT:O6=${high(p, eqPin(m.o6thru))}`);
      else if (typeof q.o6 === 'string') put(`${p}6LUT`, `${name}.${p}6LUT`, `#LUT:O6=${high(p, q.o6.slice(6))}`);
      else if (a6High.has(`${i}:${p}`)) put(`${p}6LUT`, `${name}.${p}6LUT`, `#LUT:O6=${high(p, '0')}`);
      else put(`${p}6LUT`, '', '#OFF');
      const di = carry ? carry.pins[`DI<${k}>`] ?? 0 : null;
      if (typeof q.o5 === 'number') put(`${p}5LUT`, cells[q.o5].name, `#LUT:O5=${lutEquation(lutInit(cells[q.o5]), lutInputsOf(cells[q.o5], m.o5))}`);
      else if (typeof q.o5 === 'string') put(`${p}5LUT`, `${netNameOf(+q.o5.slice(5))}_rt5`, `#LUT:O5=${eqPin(m.o5thru)}`);
      else if (m.diThru) put(`${p}5LUT`, `${name}.${p}5LUT`, `#LUT:O5=${eqPin(m.o6thru)}`);
      else if (m.diConst === 'o5') put(`${p}5LUT`, `${name}.${p}5LUT`, `#LUT:O5=${di}`);
      else put(`${p}5LUT`, '', '#OFF');
      // the carry's DI
      if (carry) put(`${p}CY0`, '', typeof q.o5 === 'number' || m.diThru || m.diConst === 'o5' ? 'O5' : `${p}X`);
      // the storage elements
      if (q.ff === AND2L) { put(`${p}FF`, `${name}.${p}FF_rt`, '#AND2L'); put(`${p}FFMUX`, '', 'XOR'); put(`${p}FFSRINIT`, '', 'SRINIT0'); }
      else if (typeof q.ff === 'number') {
        const c = cells[q.ff];
        put(`${p}FF`, c.name, ffKind(c.type).latch ? '#LATCH' : '#FF');
        put(`${p}FFMUX`, '', ffSource(s, p, k, c.pins.D ?? 0));
        put(`${p}FFSRINIT`, '', srinit(c));
      } else { put(`${p}FF`, '', '#OFF'); put(`${p}FFMUX`, '', '#OFF'); put(`${p}FFSRINIT`, '', '#OFF'); }
      // (a 5FF has no setting but its name: A5FF:<name>:, as ISE writes it)
      if (typeof q.ff5 === 'number') { put(`${p}5FF`, cells[q.ff5].name, ''); put(`${p}5FFSRINIT`, '', srinit(cells[q.ff5])); }
      else put(`${p}5FFSRINIT`, '', '#OFF');
      // the outputs
      const mux = { o5: 'O5', xor: 'XOR', cy: 'CY', f7: 'F7', f8: 'F8', ff5: `${p}5Q` }[q.mux];
      put(`${p}OUTMUX`, '', drives[i].has(`${p}MUX`) && mux ? mux : '#OFF');
      put(`${p}USED`, '', drives[i].has(p) ? '0' : '#OFF');
    });
    const and2l = s.ctrl === AND2L;
    put('CLKINV', '', and2l ? 'CLK_B' : kind ? (s.ctrl.split(':')[1] === '1' ? 'CLK_B' : 'CLK') : '#OFF');
    put('CEUSED', '', takes[i].has('CE') ? '0' : '#OFF');
    put('SRUSED', '', takes[i].has('SR') ? '0' : '#OFF');
    put('SYNC_ATTR', '', and2l ? 'ASYNC' : kind ? (kind.sr && kind.async ? 'ASYNC' : 'SYNC') : '#OFF');
    if (carry) {
      put('CARRY4', carry.name, '');
      const bottom = s.chain?.index === 0, cy = carry.pins.CYINIT ?? 0;
      put('PRECYINIT', '', !bottom ? '#OFF' : konst(cy) !== null ? String(cy) : 'AX');
      put('COUTUSED', '', drives[i].has('COUT') ? '0' : '#OFF');
    }
    if (typeof s.f7.A === 'number') put('F7AMUX', cells[s.f7.A].name, '');
    if (typeof s.f7.B === 'number') put('F7BMUX', cells[s.f7.B].name, '');
    if (typeof s.f8 === 'number') put('F8MUX', cells[s.f8].name, '');
  }
  // a LUT's inputs as lutEquation takes them: their site pins, or the constants they are tied to
  // (an equation names the inputs A1 … A6 in every position: B3 is its A3)
  function lutInputsOf(c, pins) {
    const nets = Object.entries(c.pins).filter(([p]) => /^I\d?$/.test(p)).sort().map(([, n]) => n);
    return nets.map((n, k) => (pins[k] ? eqPin(pins[k]) : konst(n) ?? 0));
  }
  // the source of a storage element's D in its slice (its FFMUX)
  function ffSource(s, p, k, d) {
    const q = s.pos[p];
    if (typeof q.o6 === 'number' && cells[q.o6].pins.O === d) return 'O6';
    if (typeof q.o5 === 'number' && cells[q.o5].pins.O === d) return 'O5';
    if (s.carry !== null) { const c = cells[s.carry]; if (c.pins[`O<${k}>`] === d) return 'XOR'; if (c.pins[`CO<${k}>`] === d) return 'CY'; }
    if (p === 'A' && typeof s.f7.A === 'number' && cells[s.f7.A].pins.O === d) return 'F7';
    if (p === 'C' && typeof s.f7.B === 'number' && cells[s.f7.B].pins.O === d) return 'F7';
    if (p === 'B' && typeof s.f8 === 'number' && cells[s.f8].pins.O === d) return 'F8';
    return `${p}X`;
  }
  // the value a set / reset gives (and the configuration's): 1 for a set or preset, or no set / reset and INIT 1
  function srinit(c) {
    const k = ffKind(c.type);
    return k.sr === 'S' || k.sr === 'PRE' || (!k.sr && paramInt(c.params.INIT, 0) === 1) ? 'SRINIT1' : 'SRINIT0';
  }
  function iobCfg(inst, put) {
    const a = inst.cons || {}, c = cells[inst.cell];
    const std = String(a.iostandard || 'LVCMOS25').toUpperCase();
    const inb = inst.dir !== 'out', outb = inst.dir !== 'in';
    const tri = c.type === 'IOBUF' || (c.type === 'OBUFT' && (c.pins.T ?? 0) !== 0);
    put('BYPASS_MUX', '', inb ? 'I' : '#OFF');
    put('DRIVEATTRBOX', '', outb ? String(a.drive || 12) : '#OFF');
    put('IMUX', inb ? `${inst.name}.IMUX` : '', inb ? 'I' : '#OFF');
    put('OUSED', '', outb ? '0' : '#OFF');
    put('PULLTYPE', '', a.pull ? { up: 'PULLUP', down: 'PULLDOWN', keeper: 'KEEPER' }[a.pull] || '#OFF' : '#OFF');
    put('SLEW', '', outb ? String(a.slew || 'slow').toUpperCase() : '#OFF');
    put('SUSPEND', '', outb ? '3STATE' : '#OFF');
    put('TUSED', '', tri ? '0' : '#OFF');
    if (inb) put('INBUF', `${c.name}_IBUF`, '');
    if (outb) put('OUTBUF', `${c.name}_OBUF`, '');
    put('PAD', inst.port, '');
    if (inb) put('ISTANDARD', '', std);
    if (outb) put('OSTANDARD', '', std);
  }
  function bramCfg(c, type, put) {
    const P = c.params;
    put(type, c.name, '');
    const r8 = type === 'RAMB8BWER';
    const inv = r8 ? ['CLKAWRCLK', 'CLKBRDCLK', 'ENAWREN', 'ENBRDEN', 'REGCEA', 'REGCEBREGCE', 'RSTA', 'RSTBRST', 'WEAWEL0', 'WEAWEL1', 'WEBWEU0', 'WEBWEU1']
      : ['CLKA', 'CLKB', 'ENA', 'ENB', 'REGCEA', 'REGCEB', 'RSTA', 'RSTB', 'WEA0', 'WEA1', 'WEA2', 'WEA3', 'WEB0', 'WEB1', 'WEB2', 'WEB3'];
    for (const p of inv) put(`${p}INV`, '', p);
    put('DATA_WIDTH_A', '', String(paramInt(P.DATA_WIDTH_A, r8 ? 18 : 36)));
    put('DATA_WIDTH_B', '', String(paramInt(P.DATA_WIDTH_B, r8 ? 18 : 36)));
    put('DOA_REG', '', String(paramInt(P.DOA_REG, 0)));
    put('DOB_REG', '', String(paramInt(P.DOB_REG, 0)));
    for (const k of ['EN_RSTRAM_A', 'EN_RSTRAM_B', 'RSTTYPE', 'RST_PRIORITY_A', 'RST_PRIORITY_B', 'WRITE_MODE_A', 'WRITE_MODE_B', ...(r8 ? ['RAM_MODE'] : [])]) {
      if (P[k] !== undefined) put(k, '', strOf(P[k]));
    }
    const words = r8 ? 32 : 64, pwords = r8 ? 4 : 8;
    for (let k = 0; k < words; k++) { const key = `INIT_${k.toString(16).toUpperCase().padStart(2, '0')}`; put(key, '', hexOf(P[key], 256)); }
    for (let k = 0; k < pwords; k++) { const key = `INITP_${k.toString(16).toUpperCase().padStart(2, '0')}`; put(key, '', hexOf(P[key], 256)); }
    const w = r8 ? 18 : 36;
    for (const k of ['INIT_A', 'INIT_B', 'SRVAL_A', 'SRVAL_B']) put(k, '', hexOf(P[k], w));
  }
  function dspCfg(c, put) {
    const P = c.params;
    put('DSP48A1', c.name, '');
    for (const k of ['A0REG', 'A1REG', 'B0REG', 'B1REG', 'CARRYINREG', 'CARRYOUTREG', 'CREG', 'DREG', 'MREG', 'OPMODEREG', 'PREG']) put(k, '', String(paramInt(P[k], k === 'CARRYOUTREG' ? 1 : 0)));
    put('B_INPUT', '', strOf(P.B_INPUT || 'DIRECT'));
    put('CARRYINSEL', '', strOf(P.CARRYINSEL || 'OPMODE5'));
    put('RSTTYPE', '', strOf(P.RSTTYPE || 'SYNC'));
    put('CLKINV', '', 'CLK');
    for (const p of ['CEA', 'CEB', 'CEC', 'CED', 'CEM', 'CEP', 'CEOPMODE', 'CECARRYIN', 'RSTA', 'RSTB', 'RSTC', 'RSTD', 'RSTM', 'RSTP', 'RSTOPMODE', 'RSTCARRYIN']) put(`${p}INV`, '', p);
  }

  const nets = [];
  const tieoffs = new Map();   // the XDL_DUMMY instances of the TIEOFFs, by site
  const constUsed = new Set(); // the slice positions taken as constant sources
  for (const n of phys.nets) {
    const inpins = n.loads.map(l => ({ inst: insts[l.inst].name, pin: l.pin }));
    if (!n.power || !device) {
      nets.push({ name: n.name, type: n.power || 'wire', outpins: n.driver ? [{ inst: insts[n.driver.inst].name, pin: n.driver.pin }] : [], inpins, pips: [] });
      continue;
    }
    // a power net: one net a source, the TIEOFF each pin is tied from, or (a pin no TIEOFF's constant reaches: the
    // GND_WIRE does not go to the I/O logic) the free LUT position of a slice nearby, its output the constant (ISE's
    // _GND_SOURCE::C); as ISE writes them: GLOBAL_LOGIC1_0 …
    const parts = new Map();
    const attr = n.power === 'vcc' ? '_VCC_SOURCE' : '_GND_SOURCE';
    n.loads.forEach((l, k) => {
      const t = tieoffFor(device, device.sitePinNode(placement.site[l.inst], l.pin), n.power);
      const key = t ? t.site : sliceSource(l.inst, attr);
      if (!parts.has(key)) parts.set(key, { t, inpins: [] });
      parts.get(key).inpins.push(inpins[k]);
    });
    let k = 0;
    for (const [key, { t, inpins: ins }] of [...parts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (!t) { const [inst, pin] = key.split('\0'); nets.push({ name: `${n.name}_${k++}`, type: n.power, outpins: [{ inst, pin }], inpins: ins, pips: [] }); continue; }
      const dname = `XDL_DUMMY_${t.tile}_${t.site}`;
      const d = tieoffs.get(t.site) || { name: dname, type: 'TIEOFF', placed: true, tile: t.tile, site: t.site, cfg: [{ attr: '_NO_USER_LOGIC', name: '', value: '' }] };
      if (!d.cfg.some(c => c.attr === attr)) d.cfg.push({ attr, name: '', value: t.pin });
      tieoffs.set(t.site, d);
      nets.push({ name: `${n.name}_${k++}`, type: n.power, outpins: [{ inst: dname, pin: t.pin }], inpins: ins, pips: [] });
    }
  }
  return { name, part, insts: [...out, ...tieoffs.values()], nets };

  // the slice position nearest instance i whose LUT is free (no O6, no O5, its output unused; not a carry stage's):
  // its output as a constant source (attr: _GND_SOURCE / _VCC_SOURCE), the key inst \0 pin of its net
  function sliceSource(i, attr) {
    const [x, y] = placement.pos[i];
    let best = null;
    insts.forEach((inst, j) => {
      if (inst.kind !== 'slice') return;
      const s = packed.slices[inst.slice];
      if (s.carry !== null) return;
      const p = POS.find(q => s.pos[q].o6 === null && s.pos[q].o5 === null && !drives[j].has(q) && !constUsed.has(`${j}:${q}`));
      if (!p) return;
      const d = Math.abs(placement.pos[j][0] - x) + Math.abs(placement.pos[j][1] - y);
      if (!best || d < best.d) best = { j, p, d };
    });
    if (!best) throw new XdlError(`${insts[i].name}: no TIEOFF nor free LUT to tie its pin to ${attr === '_VCC_SOURCE' ? 1 : 0}`);
    constUsed.add(`${best.j}:${best.p}`);
    out[best.j].cfg.push({ attr, name: '', value: best.p });
    return `${insts[best.j].name}\0${best.p}`;
  }
}
