// Silinx toolchain - the packer's pads and clock buffers (#405: out of packWith in core/fpga/pack.js): the IOBs, the
// global clock buffers, the block RAMs, multipliers and DCMs on sites of their own; the multiplier chains (#2).
import { BRAM_TYPE, DCM_TYPE, MULT_TYPE, PackError } from './pack.js';

/** { multChains } of packWith. */
export function mountPads(ctx) {
  const {
    nl, cells, ci, cons, extra, insts, iobDdr, iobDdrSinks, iobFf, iobInputDdr, iobInputReg, iobOutputDdr,
    iobOutputRegs, iobRegSinks, liveCells, loadsOf, multBelow, nets, packBram, packDcm, packMult, setSink, stats, where
  } = ctx;

  // ---------------------------------------------------------------- pads and clock buffers
  const portOfNet = new Map();
  for (const p of nl.ports) for (const b of p.bits) if (nets[b.net].const === undefined) portOfNet.set(b.net, { ...b, dir: p.dir });
  for (const c of liveCells()) {
    if (/^(IBUF|IBUFG)$/.test(c.type)) {
      const port = portOfNet.get(c.pins.I);
      if (!port) throw new PackError(`pack: ${c.name}: input buffer not on a port`);
      // an input nothing reads gets no pad (as ISE's map trims it; ISE's DRC calls its buffer's
      // output a dangling pin)
      if (!loadsOf(c.pins.O).length) { where.set(ci(c), { inst: -1, bel: 'UNUSED' }); setSink(ci(c), 'I', 'int'); stats.unusedInputs = (stats.unusedInputs || 0) + 1; continue; }
      const a = cons[port.name] || {};
      const reg = iobFf.get(ci(c))?.I, ddr = iobDdr.get(ci(c));
      // (the input straight to the fabric too: IMUX; an input register alone does not have it)
      const direct = !(reg || ddr) || loadsOf(c.pins.O).some(l => l.cell !== (reg || ddr).cell && l.cell !== ddr?.idx);
      const cfg = [...(direct ? [['IDELMUX', '', '1'], ['IMUX', '', '1']] : []), ['IOATTRBOX', '', a.iostandard || 'LVCMOS25']];
      if (reg) cfg.push(...iobInputReg(reg, port.name));
      if (ddr) cfg.push(...iobInputDdr(ddr, port.name));
      cfg.push(['INBUF', `${port.name}_IBUF`, ''], ['PAD', port.name, '']);
      if (a.pull) cfg.push(['PULL', '', { up: 'PULLUP', down: 'PULLDOWN', keeper: 'KEEPER' }[a.pull]]);
      const s = { kind: 'iob', type: 'IBUF', name: port.name, loc: a.loc || null, dir: 'in', fixedCfg: cfg, idx: insts.length, regs: reg || ddr ? ['I'] : [] };
      insts.push(s);
      where.set(ci(c), { inst: s.idx, bel: 'INBUF' });
      setSink(ci(c), 'I', 'int');
      if (reg) iobRegSinks(s, reg, 'I');
      if (ddr) iobDdrSinks(s, ddr);
    } else if (c.type === 'OBUF' || c.type === 'OBUFT') {
      const port = portOfNet.get(c.pins.O);
      if (!port) throw new PackError(`pack: ${c.name}: output buffer not on a port`);
      const a = cons[port.name] || {};
      const r = iobFf.get(ci(c)) || {}, ddr = iobDdr.get(ci(c));
      // a tristate output: its enable on T1 (TMUX T1) or from the output-enable register (TFF1)
      const tri = c.type === 'OBUFT' && nets[c.pins.T].const !== 0;
      const cfg = [['DRIVEATTRBOX', '', String(a.drive || 12)], ['IOATTRBOX', '', a.iostandard || 'LVCMOS25'], ['O1INV', '', 'O1'], ['OMUX', '', ddr ? 'OFFDDR' : r.O ? 'OFF1' : 'O1'],
        ['SLEW', '', (a.slew || 'slow').toUpperCase()]];
      if (tri) cfg.push(['T1INV', '', 'T1'], ['TMUX', '', r.T ? 'TFF1' : 'T1']);
      cfg.push(...iobOutputRegs(r));
      if (ddr) cfg.push(...iobOutputDdr(ddr));
      cfg.push(['OUTBUF', `${port.name}_OBUF`, ''], ['PAD', port.name, '']);
      if (a.pull) cfg.push(['PULL', '', { up: 'PULLUP', down: 'PULLDOWN', keeper: 'KEEPER' }[a.pull]]);
      const s = { kind: 'iob', type: 'IOB', name: port.name, loc: a.loc || null, dir: 'out', fixedCfg: cfg, idx: insts.length, regs: ddr ? ['O'] : Object.keys(r) };
      insts.push(s);
      where.set(ci(c), { inst: s.idx, bel: 'OUTBUF' });
      if (ddr) { setSink(ci(c), 'I', 'int'); iobDdrSinks(s, ddr); } else if (r.O) { setSink(ci(c), 'I', 'int'); iobRegSinks(s, r.O, 'O'); } else setSink(ci(c), 'I', { inst: s.idx, pin: 'O1', kind: 'gen' });
      if (c.type === 'OBUFT') {
        if (!tri) setSink(ci(c), 'T', 'int');
        else if (r.T) { setSink(ci(c), 'T', 'int'); iobRegSinks(s, r.T, 'T'); } else setSink(ci(c), 'T', { inst: s.idx, pin: 'T1', kind: 'gen' });
      }
    } else if (c.type === 'IOBUF') {
      // a bidirectional pad (#96): the output buffer from O1, its enable on T1 (TMUX T1; tied to 0, always driving), the
      // input buffer straight to the fabric (IMUX) when something reads it; no IOB registers
      const port = portOfNet.get(c.pins.IO);
      if (!port) throw new PackError(`pack: ${c.name}: bidirectional buffer not on a port`);
      const a = cons[port.name] || {};
      const tri = nets[c.pins.T].const !== 0, read = c.pins.O !== undefined && loadsOf(c.pins.O).length > 0;
      const cfg = [['DRIVEATTRBOX', '', String(a.drive || 12)], ['IOATTRBOX', '', a.iostandard || 'LVCMOS25'], ['O1INV', '', 'O1'], ['OMUX', '', 'O1'],
        ['SLEW', '', (a.slew || 'slow').toUpperCase()]];
      if (tri) cfg.push(['T1INV', '', 'T1'], ['TMUX', '', 'T1']);
      if (read) cfg.push(['IDELMUX', '', '1'], ['IMUX', '', '1'], ['INBUF', `${port.name}_IBUF`, '']);
      cfg.push(['OUTBUF', `${port.name}_OBUF`, ''], ['PAD', port.name, '']);
      if (a.pull) cfg.push(['PULL', '', { up: 'PULLUP', down: 'PULLDOWN', keeper: 'KEEPER' }[a.pull]]);
      const s = { kind: 'iob', type: 'IOB', name: port.name, loc: a.loc || null, dir: 'out', fixedCfg: cfg, idx: insts.length, regs: [] };
      insts.push(s);
      where.set(ci(c), { inst: s.idx, bel: 'IOBUF' });
      setSink(ci(c), 'I', { inst: s.idx, pin: 'O1', kind: 'gen' });
      setSink(ci(c), 'T', tri ? { inst: s.idx, pin: 'T1', kind: 'gen' } : 'int');
      setSink(ci(c), 'IO', 'int');
    } else if (c.type === 'BUFG') {
      const s = { kind: 'bufg', type: 'BUFGMUX', name: c.name, loc: null, fixedCfg: null, idx: insts.length, cell: ci(c) };
      insts.push(s);
      where.set(ci(c), { inst: s.idx, bel: 'BUFG' });
      setSink(ci(c), 'I', { inst: s.idx, pin: 'I0', kind: 'gen' });
      // the select input is tied high (SINV inverts it: I0 selected), as ISE's map does
      extra.push({ net: 1, inst: s.idx, pin: 'S', kind: 'gen' });
    } else if (/^BUFGMUX(_1)?$/.test(c.type)) {
      // a clock switch (#846): I0 when S is low, I1 when it is high (SINV not inverted); BUFGMUX_1 holds its
      // output high while it switches (DISABLE_ATTR HIGH)
      const s = { kind: 'bufg', type: 'BUFGMUX', name: c.name, loc: null, fixedCfg: null, idx: insts.length, cell: ci(c), mux: c.type === 'BUFGMUX_1' ? 'HIGH' : 'LOW' };
      insts.push(s);
      where.set(ci(c), { inst: s.idx, bel: 'BUFG' });
      for (const pin of ['I0', 'I1', 'S']) setSink(ci(c), pin, { inst: s.idx, pin, kind: 'gen' });
    } else if (BRAM_TYPE.test(c.type)) packBram(c);
    else if (MULT_TYPE.test(c.type)) packMult(c);
    else if (DCM_TYPE.test(c.type)) packDcm(c);
  }
  for (const c of cells) if (!c.lowered && !where.has(ci(c))) throw new PackError(`pack: ${c.type} ${c.name} was not packed`);
  // the multiplier chains (#2), each from its lowest one up: instance indices
  const multChains = [];
  const multAbove = new Map([...multBelow].map(([up, down]) => [down, up]));
  for (const [down] of multAbove) {
    if (multBelow.has(down)) continue;
    const chain = [down];
    for (let x = multAbove.get(down); x !== undefined && !chain.includes(x); x = multAbove.get(x)) chain.push(x);
    multChains.push(chain.map(x => where.get(x).inst));
  }
  const ringMult = [...multBelow.keys()].find(x => !multChains.some(ch => ch.includes(where.get(x).inst)));
  if (ringMult !== undefined) throw new PackError(`pack: ${cells[ringMult].type} ${cells[ringMult].name}: a ring of multipliers through BCIN is not possible`);

  return { multChains };
}
