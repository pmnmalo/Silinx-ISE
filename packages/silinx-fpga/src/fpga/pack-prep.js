// Silinx toolchain - the packer's netlist (#405: out of packWith in core/fpga/pack.js): the constraints, own copies of
// the nets and cells, inverters on clock and control pins as their slices' inversions (#80, #527), INV / BUF as LUTs,
// carry stages that pass their carry in left out (#591), a RAM64X1S as two RAM32X1S, the clock switches' inputs and
// constant selects (#846); the cells it cannot pack refused.
import { paramBits, paramInt } from './netlist.js';
import { parseUcf, portAssignments } from '../ucf.js';
import { BRAM_TYPE, DCM_TYPE, LUT_K, MULT_TYPE, MUXF, PackError, SLICEM_MEM, ffKind, ucfPortsOf } from './pack.js';

/** { carryPass, cells, ci, cons, driverCell, instLocs, isLut, liveCells, loadsOf, nets, parsedUcf, relabel } of packWith. */
export function mountPrep(ctx) {
  const {
    nl, ucf
  } = ctx;

  // (given the top's ports, a name such as x[1] is a bus bit only when x is a bus: #63, #84)
  const parsedUcf = typeof ucf === 'string' ? parseUcf(ucf, { ports: ucfPortsOf(nl) }) : ucf;
  // the constraints of each port bit, a NET name with wildcards on every bit it matches (#773)
  const cons = portAssignments(parsedUcf?.assignments ? parsedUcf : { assignments: ucf || {} }, nl.ports.flatMap(p => p.bits.map(b => b.name))).assignments;
  // INST "name" LOC = "DCM_X1Y0": the site of a DCM (#47; the placer chooses one otherwise)
  const instLocs = new Map();
  for (const st of parsedUcf?.other || []) {
    const m = /^INST\s+"?([^"\s]+)"?\s+LOC\s*=\s*"?([^"\s;]+)"?\s*$/i.exec(String(st).trim());
    if (m) instLocs.set(m[1], m[2].toUpperCase());
  }
  // own copies: the packer renames pins (INV -> LUT1, MUXF -> LUT3) and must not change its input
  const nets = nl.nets.map(n => ({ ...n, loads: n.loads.map(l => ({ ...l })) }));
  const cells = nl.cells.map((c, idx) => ({ ...c, pins: { ...c.pins }, idx }));
  const loadsOf = n => nets[n].loads;

  // An inverter whose loads are all clock pins of flip-flops and latches (C, G) is their slices' CLKINV, as XST
  // maps it: the synthesis's extractinv (-ise) writes IS_C_INVERTED / IS_G_INVERTED as one INV per cell, which as a
  // LUT puts logic on the clock (ISE's DRC: "Gated clock", one per inverter; vtr-ch-intrinsics' latches, #80). The
  // pins take the inverter's input with their inversion toggled, and the inverter is left out.
  // So do the clock enable and set / reset pins (#527): the slice's CEINV / SRINV, as XST maps an
  // active-low reset; extractinv writes one INV per flip-flop, which made a LUT of each. An inverter
  // that also drives logic keeps those loads.
  // (and the clocks of the IOBs' DDR registers, #96: ISE's map writes C1 = not C0 as ICLK2INV / OTCLK2INV::*_B on C0's net)
  const ctrlPin = l => {
    if (/^(IDDR2|ODDR2)$/.test(cells[l.cell].type)) return l.pin === 'C0' || l.pin === 'C1';
    const k = ffKind(cells[l.cell].type);
    return !!k && [k.latch ? 'G' : 'C', k.latch ? 'GE' : 'CE', k.sr].includes(l.pin);
  };
  for (const c of cells) {
    if (c.type !== 'INV') continue;
    const out = c.pins.O, src = c.pins.I;
    if (nets[out].port || nets[src].const !== undefined) continue;
    const moved = nets[out].loads.filter(ctrlPin);
    if (!moved.length) continue;
    for (const l of moved) {
      const f = cells[l.cell], inv = `IS_${l.pin}_INVERTED`;
      f.pins[l.pin] = src;
      f.params = { ...f.params, [inv]: paramInt(f.params?.[inv]) ^ 1 };
      nets[src].loads.push(l);
    }
    nets[out].loads = nets[out].loads.filter(l => !moved.includes(l));
    if (nets[out].loads.length) continue;
    nets[src].loads = nets[src].loads.filter(l => l.cell !== c.idx);
    nets[out].driver = null;
    c.lowered = true;
  }
  // INV / BUF are 1-input LUTs
  for (const c of cells) {
    if (c.lowered) continue;
    if (c.type === 'INV') { c.type = 'LUT1'; c.params = { INIT: '01' }; c.pins = { I0: c.pins.I, O: c.pins.O }; relabel(c, { I: 'I0' }); }
    else if (c.type === 'BUF') { c.type = 'LUT1'; c.params = { INIT: '10' }; c.pins = { I0: c.pins.I, O: c.pins.O }; relabel(c, { I: 'I0' }); }
  }
  let carryPass = 0;
  // A carry stage whose select is the constant 1 passes its carry in (O = CI) and no sum reads it:
  // it is left out, its loads read the carry in (#591: blinky's comparator ended in three such
  // stages, a constant's bits, each a stage of delay and the last one's carry out through the slow
  // XORG instead of an XORF)
  for (const c of cells) {
    if (c.lowered || c.type !== 'MUXCY' || nets[c.pins.S].const !== 1) continue;
    const ciNet = c.pins.CI, out = c.pins.O;
    if (nets[ciNet].const !== undefined || nets[out].port) continue;
    if (nets[ciNet].loads.some(l => cells[l.cell].type === 'XORCY' && l.pin === 'CI')) continue;
    for (const n of new Set([ciNet, c.pins.S, c.pins.DI])) nets[n].loads = nets[n].loads.filter(l => l.cell !== c.idx);
    for (const l of nets[out].loads) { cells[l.cell].pins[l.pin] = ciNet; nets[ciNet].loads.push(l); }
    nets[out].loads = [];
    nets[out].driver = null;
    c.lowered = true;
    carryPass++;
  }
  function relabel(c, map) {
    for (const n of Object.values(c.pins)) for (const l of nets[n].loads) if (l.cell === c.idx && map[l.pin]) l.pin = map[l.pin];
  }
  const ci = c => c.idx;
  const isLut = c => LUT_K[c.type] !== undefined;
  const driverCell = n => (nets[n].driver ? cells[nets[n].driver.cell] : null);
  // A RAM64X1S is two RAM32X1S (addresses 0-31 and 32-63, each written when WE and A5 select it)
  // and a 3-input LUT choosing the read word by A5, as ISE's map builds it on the Spartan-3E
  for (const c of cells.filter(x => x.type === 'RAM64X1S')) lowerRam64(c);
  function lowerRam64(c) {
    const addNet = name => { const k = nets.length; nets.push({ id: k, name: uniqueNetName(name), driver: null, port: null, loads: [] }); return k; };
    const addCell = (name, type, params, pins, outs) => {
      const cell = { name, type, params, attrs: {}, pins, dirs: {}, idx: cells.length };
      cells.push(cell);
      for (const [p, n] of Object.entries(pins)) {
        if (outs.includes(p)) { cell.dirs[p] = 'output'; nets[n].driver = { cell: cell.idx, pin: p }; } else { cell.dirs[p] = 'input'; nets[n].loads.push({ cell: cell.idx, pin: p }); }
      }
      return cell;
    };
    const p = c.pins;
    // the RAM64X1S's own pins leave its nets
    for (const n of new Set(Object.values(p))) nets[n].loads = nets[n].loads.filter(l => l.cell !== c.idx);
    const init = paramBits(c.params.INIT) || [];
    const half = h => init.slice(32 * h, 32 * h + 32).concat(new Array(32).fill(0)).slice(0, 32).reverse().join('');
    const weLo = addNet(`${c.name}_we0`), weHi = addNet(`${c.name}_we1`), oLo = addNet(`${c.name}_o0`), oHi = addNet(`${c.name}_o1`);
    // LUT INIT strings, most significant bit first (I0 = bit 0 of the index)
    addCell(`${c.name}_we0`, 'LUT2', { INIT: '0010' }, { I0: p.WE, I1: p.A5, O: weLo }, ['O']);
    addCell(`${c.name}_we1`, 'LUT2', { INIT: '1000' }, { I0: p.WE, I1: p.A5, O: weHi }, ['O']);
    for (const [h, we, o] of [[0, weLo, oLo], [1, weHi, oHi]]) {
      addCell(`${c.name}_${h ? 'hi' : 'lo'}`, 'RAM32X1S', { INIT: half(h), IS_WCLK_INVERTED: c.params.IS_WCLK_INVERTED ?? 0 },
        { A0: p.A0, A1: p.A1, A2: p.A2, A3: p.A3, A4: p.A4, D: p.D, WCLK: p.WCLK, WE: we, O: o }, ['O']);
    }
    nets[p.O].driver = null;
    addCell(`${c.name}_mux`, 'LUT3', { INIT: '11001010' }, { I0: oLo, I1: oHi, I2: p.A5, O: p.O }, ['O']);
    c.lowered = true;
  }
  function uniqueNetName(base) { let n = base, k = 1; const names = new Set(nets.map(x => x.name)); while (names.has(n)) n = `${base}_${k++}`; return n; }
  const liveCells = () => cells.filter(c => !c.lowered);
  // a clock switch's input from a BUFG (Yosys's clkbufmap puts one on a clock that also clocks flip-flops): the
  // BUFG's input instead, the clock into the switch on its own line, not from the global lines through the fabric
  for (const c of liveCells()) {
    if (!/^BUFGMUX(_1)?$/.test(c.type)) continue;
    for (const pin of ['I0', 'I1']) {
      const b = c.pins[pin] !== undefined && driverCell(c.pins[pin]);
      if (b?.type !== 'BUFG' || b.pins.I === undefined) continue;
      nets[c.pins[pin]].loads = nets[c.pins[pin]].loads.filter(l => !(l.cell === c.idx && l.pin === pin));
      c.pins[pin] = b.pins.I;
      nets[b.pins.I].loads.push({ cell: c.idx, pin });
      // (a BUFG left with no load and no port: gone)
      if (!nets[b.pins.O].loads.length && !nets[b.pins.O].port) {
        nets[b.pins.I].loads = nets[b.pins.I].loads.filter(l => l.cell !== b.idx);
        nets[b.pins.O].driver = null;
        b.lowered = true;
      }
    }
  }
  // A BUFGMUX whose select is a constant is a BUFG of the input it selects (#846)
  for (const c of liveCells()) {
    if (!/^BUFGMUX(_1)?$/.test(c.type)) continue;
    const s = nets[c.pins.S]?.const;
    if (s !== 0 && s !== 1) continue;
    const keep = s ? 'I1' : 'I0';
    for (const pin of ['I0', 'I1', 'S']) if (pin !== keep && c.pins[pin] !== undefined) {
      const n = nets[c.pins[pin]];
      n.loads = n.loads.filter(l => !(l.cell === c.idx && l.pin === pin));
    }
    relabel(c, { [keep]: 'I' });
    c.pins = { I: c.pins[keep], O: c.pins.O };
    c.type = 'BUFG';
  }
  const supported = c => isLut(c) || ffKind(c.type) || MUXF[c.type] || /^(MUXCY|XORCY|IBUF|IBUFG|OBUF|OBUFT|IOBUF|BUFG|BUFGMUX|BUFGMUX_1|IDDR2|ODDR2)$/.test(c.type) || SLICEM_MEM[c.type]
    || BRAM_TYPE.test(c.type) || MULT_TYPE.test(c.type) || DCM_TYPE.test(c.type);
  const unsupported = liveCells().filter(c => !supported(c));
  if (unsupported.length) throw new PackError(`pack: cells not supported yet: ${[...new Set(unsupported.map(c => c.type))].join(', ')}`);

  return { carryPass, cells, ci, cons, driverCell, instLocs, isLut, liveCells, loadsOf, nets, parsedUcf, relabel };
}
