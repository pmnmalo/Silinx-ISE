// Silinx toolchain - the packer's registers in the IOBs (#405: out of packWith in core/fpga/pack.js, #96): the
// flip-flops (and DDR registers) that go into an IOB, by the constraints and iobRegs; a flip-flop into the slot of the
// side whose output feeds it.
import { ucfPattern } from '../ucf.js';
import { PackError } from './pack.js';

/** { absorbFf, ffsOn, iobDdr, iobFf, strParam } of packWith. */
export function mountIobRegs(ctx) {
  const {
    iobRegs, nl, cells, ci, ctrlOk, driverCell, ffs, liveCells, loadsOf, nets, parsedUcf, placeFf, warnings, where
  } = ctx;

  // ---------------------------------------------------------------- registers in the IOBs (#96)
  // A flip-flop goes into the IOB of its pad when asked: the UCF's IOB = TRUE on its instance or on
  // the port's net (IOB = FALSE keeps it out), the HDL's IOB attribute, or iobRegs (map's -pr: 'i'
  // the input registers, 'o' the output and output-enable ones, 'b' both; 'off', the default, as
  // ISE's flow runs map, -pr off). An input register: a flip-flop whose D is the pad's input (the
  // input may drive other logic too); an output register: one whose Q drives only the output buffer;
  // an output-enable register: one whose Q drives only a tristate buffer's T, with the output
  // register's clock and set / reset when the IOB has both (the IOB's OTCLK1 and SR are shared).
  const iobAsked = [];   // [NET / INST, name pattern (UCF's * and ?), true / false]: the last that matches
  for (const st of parsedUcf?.other || []) {
    const m = /^(NET|INST)\s+"?([^"\s]+)"?\s+IOB\s*=\s*"?(TRUE|FALSE|FORCE)"?\s*$/i.exec(String(st).trim());
    if (m) iobAsked.push([m[1].toUpperCase(), ucfPattern(m[2]), !/^FALSE$/i.test(m[3])]);
  }
  const asked = (kind, name) => { let v; for (const [k, re, x] of iobAsked) if (k === kind && name !== null && re.test(name)) v = x; return v; };
  const portName = n => { for (const p of nl.ports) for (const b of p.bits) if (b.net === n) return b.name; return null; };
  // (an IOB register's clock comes from a global buffer, as ISE clocks the IOBs: the router reaches an I/O
  // tile's clock pin from the global lines only, #671)
  const onGlobal = n => /^BUFG(MUX(_1)?)?$/.test(driverCell(n)?.type);
  const wantsIob = (f, port, role) => {
    const want = (() => {
      const a = asked('INST', f.name) ?? asked('NET', port);
      if (a !== undefined) return a;
      const h = cells[f.cell].attrs?.IOB ?? cells[f.cell].attrs?.iob;
      if (h !== undefined) return /^(TRUE|FORCE|1)$/i.test(String(h).replace(/"/g, ''));
      return iobRegs === 'b' || iobRegs === (role === 'I' ? 'i' : 'o');
    })();
    if (want && !onGlobal(f.ctrl.clk)) { warnings.push(`flip-flop ${f.name} kept out of the IOB of ${port}: its clock ${nets[f.ctrl.clk].name} is not on a global clock buffer`); return false; }
    return want;
  };
  // The DDR registers (#96): an IDDR2 reading a pad's input, an ODDR2 driving only an output buffer, go into that
  // pad's IOB, both flip-flops (IFF1 / IFF2, OFF1 / OFF2), as ISE's map puts them (they have no other place); the IOB
  // then has no other register of that direction (an ODDR2's output buffer no output-enable register either: the
  // IOB's OTCLK1 / OTCLK2 and SR are the ODDR2's).
  const iobDdr = new Map();   // pad buffer cell -> the DDR register's cell
  const strParam = (c, k, d) => String(c.params?.[k] ?? d).replace(/"/g, '').toUpperCase();
  for (const c of liveCells()) {
    if (!/^(IDDR2|ODDR2)$/.test(c.type)) continue;
    const align = strParam(c, 'DDR_ALIGNMENT', 'NONE');
    if (align !== 'NONE') throw new PackError(`pack: ${c.type} ${c.name}: DDR_ALIGNMENT = ${align} is not supported by the Silinx toolchain yet (only NONE)`);
    const ld = c.type === 'ODDR2' ? loadsOf(c.pins.Q) : [];
    const buf = c.type === 'IDDR2' ? driverCell(c.pins.D) : ld.length === 1 && ld[0].pin === 'I' ? cells[ld[0].cell] : null;
    if (!buf || !(c.type === 'IDDR2' ? /^(IBUF|IBUFG)$/ : /^(OBUF|OBUFT)$/).test(buf.type)) {
      throw new PackError(`pack: ${c.type} ${c.name}: ${c.type === 'IDDR2' ? 'its D must come straight from an input port' : 'its Q must drive an output port and nothing else'} (the DDR registers are in the IOBs)`);
    }
    if (iobDdr.has(ci(buf))) throw new PackError(`pack: ${c.type} ${c.name} and ${iobDdr.get(ci(buf)).name} on one pad`);
    // its clocks from global buffers (as an IOB register's, #671): C1 on C0's net (inverted) or on a buffer of its own
    for (const p of ['C0', 'C1']) if (!onGlobal(c.pins[p])) throw new PackError(`pack: ${c.type} ${c.name}: its clock ${p} (${nets[c.pins[p]].name}) is not on a global clock buffer (BUFG)`);
    const used = p => c.pins[p] !== undefined && nets[c.pins[p]].const !== 0;
    if (c.type === 'ODDR2' && used('R') && used('S')) throw new PackError(`pack: ODDR2 ${c.name}: both R and S used (the IOB has one set / reset for its output registers)`);
    iobDdr.set(ci(buf), c);
  }
  const iobFf = new Map();   // pad buffer cell -> { I | O | T: ffInfo }
  const soleFf = n => { const d = driverCell(n); const f = d && ffs.get(ci(d)); return f && f.q === n && loadsOf(n).length === 1 ? f : null; };
  const sameOt = (a, b) => !a || !b || (a.ctrl.clk === b.ctrl.clk && a.ctrl.clkInv === b.ctrl.clkInv && a.ctrl.sr === b.ctrl.sr && a.ctrl.srInv === b.ctrl.srInv && a.ctrl.sync === b.ctrl.sync);
  for (const c of cells) {
    if (c.lowered) continue;
    const r = {};
    if (iobDdr.has(ci(c))) continue;
    if (c.type === 'IBUF') {
      const port = portName(c.pins.I);
      const f = loadsOf(c.pins.O).filter(l => l.pin === 'D' && ffs.has(l.cell)).map(l => ffs.get(l.cell)).find(x => !x.kind.latch && wantsIob(x, port, 'I'));
      if (f) r.I = f;
    } else if (c.type === 'OBUF' || c.type === 'OBUFT') {
      const port = portName(c.pins.O);
      const o = soleFf(c.pins.I), t = c.type === 'OBUFT' ? soleFf(c.pins.T) : null;
      if (o && !o.kind.latch && wantsIob(o, port, 'O')) r.O = o;
      if (t && !t.kind.latch && wantsIob(t, port, 'T') && sameOt(r.O, t)) r.T = t;
    }
    if (!Object.keys(r).length) continue;
    iobFf.set(ci(c), r);
    for (const f of Object.values(r)) ffs.delete(f.cell);
  }
  // the flip-flops whose D is net n
  const ffsOn = n => loadsOf(n).filter(l => l.pin === 'D' && ffs.has(l.cell) && !where.has(l.cell)).map(l => ffs.get(l.cell));
  // try to put a flip-flop fed by the output multiplexer of side `side` into that side's slot
  function absorbFf(s, side, net) {
    if (s.ff[side]) return;
    const f = ffsOn(net).find(x => ctrlOk(s, x));
    if (f) placeFf(s, side, f, 'mux');
  }

  return { absorbFf, ffsOn, iobDdr, iobFf, strParam };
}
